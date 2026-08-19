// Copyright (c) 2026 Casual Office
// SPDX-License-Identifier: Apache-2.0

import type {
  AuthErrorCode,
  DesktopAuthExchangeResponse,
  DesktopAuthStartResponse,
  DesktopSessionResponse,
  LeasePayload,
} from './types.ts';
import {
  createDeviceProofSignature,
  createPkceChallenge,
  exportPrivateKeyJwk,
  generateDeviceKeyPair,
  generateRandomUrlSafeString,
  importPrivateKeyJwk,
  verifyLeaseTokenOffline,
} from './crypto.ts';
import { SecureAuthStore } from './store.ts';

export interface AuthConfig {
  baseUrl?: string;
  leasePublicKeyBase64?: string;
  platform?: 'macOS' | 'Windows';
}

export class AuthService {
  public static readonly APP_SLUG = 'cpdf';
  public static readonly CALLBACK_SCHEME = 'cookapps-cpdf';

  private baseUrl: string;
  private leasePublicKeyBase64: string;
  private platform: 'macOS' | 'Windows';

  constructor(config?: AuthConfig) {
    this.baseUrl =
      config?.baseUrl ||
      (typeof process !== 'undefined' && process.env?.VITE_COOKAPPS_BASE_URL) ||
      (typeof window !== 'undefined' && (window as unknown as { __COOKAPPS_BASE_URL__?: string }).__COOKAPPS_BASE_URL__) ||
      'https://cookapps.net';

    this.leasePublicKeyBase64 =
      config?.leasePublicKeyBase64 ||
      (typeof process !== 'undefined' && process.env?.VITE_DESKTOP_LEASE_PUBLIC_KEY_BASE64) ||
      (typeof window !== 'undefined' && (window as unknown as { __DESKTOP_LEASE_PUBLIC_KEY_BASE64__?: string }).__DESKTOP_LEASE_PUBLIC_KEY_BASE64__) ||
      'MCowBQYDK2VwAyEAvSTxJ6EC0pASM2tyZYWRB7MZ7KTw/g3g03FwGPIh+EM=';

    const osPlatform =
      typeof navigator !== 'undefined' && navigator.platform.includes('Mac')
        ? 'macOS'
        : 'Windows';

    this.platform = config?.platform || osPlatform;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getApiPrefix(): string {
    if (
      typeof window !== 'undefined' &&
      !window.__deskApp__ &&
      (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') &&
      this.baseUrl === 'https://cookapps.net'
    ) {
      return '';
    }
    return this.baseUrl;
  }

  public getLeasePublicKeyBase64(): string {
    return this.leasePublicKeyBase64;
  }

  /**
   * Helper for constant-time string comparison to prevent timing attacks on state verification.
   */
  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  /**
   * Ensures device keypair exists and is loaded.
   */
  private async getOrCreateDeviceKeyPair(): Promise<{
    privateKey: CryptoKey;
    publicKeySpkiBase64: string;
  }> {
    const existingJwk = await SecureAuthStore.getDevicePrivateKeyJwk();
    const existingSpki = await SecureAuthStore.getDevicePublicKeySpki();

    if (existingJwk && existingSpki) {
      try {
        const privateKey = await importPrivateKeyJwk(existingJwk);
        return { privateKey, publicKeySpkiBase64: existingSpki };
      } catch {
        // Regenerate if key corrupted
      }
    }

    const { publicKeySpkiBase64, privateKey } = await generateDeviceKeyPair();
    const jwk = await exportPrivateKeyJwk(privateKey);

    await SecureAuthStore.setDevicePrivateKeyJwk(jwk);
    await SecureAuthStore.setDevicePublicKeySpki(publicKeySpkiBase64);

    return { privateKey, publicKeySpkiBase64 };
  }

  private isTauri(): boolean {
    return typeof window !== 'undefined' && !!(window as any).__TAURI__;
  }

  /**
   * Native HTTP fetch via Tauri backend command - bypasses WebView2 CORS.
   * Falls back to browser fetch() when not running in Tauri.
   */
  private async httpFetch(url: string, init: RequestInit): Promise<Response> {
    // In Tauri: always use native Rust HTTP to bypass CORS
    if (this.isTauri()) {
      try {
        const headers: Array<[string, string]> = [];
        if (init.headers) {
          for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
            headers.push([k, v]);
          }
        }
        const res: { status: number; body: string; ok: boolean } = await (window as any).__TAURI__.core.invoke('native_fetch', {
          req: {
            url,
            method: init.method || 'GET',
            headers: headers.length > 0 ? headers : null,
            body: init.body ? String(init.body) : null,
          },
        });
        return new Response(res.body, { status: res.status });
      } catch (err) {
        throw new Error(`Native fetch failed: ${err}`);
      }
    }
    // Browser context: standard fetch
    return fetch(url, init);
  }

  /**
   * Step 1: Start desktop login flow (POST /api/desktop/auth/start).
   */
  public async startLogin(deviceName = 'User Desktop PC'): Promise<DesktopAuthStartResponse> {
    const deviceKey = await SecureAuthStore.getOrCreateDeviceKey();
    const { publicKeySpkiBase64 } = await this.getOrCreateDeviceKeyPair();

    const codeVerifier = generateRandomUrlSafeString(64);
    const codeChallenge = await createPkceChallenge(codeVerifier);
    const state = generateRandomUrlSafeString(32);

    await SecureAuthStore.setPendingState(state);
    await SecureAuthStore.setPendingCodeVerifier(codeVerifier);

    const body = {
      appSlug: AuthService.APP_SLUG,
      deviceKey,
      deviceName,
      platform: this.platform,
      state,
      codeChallenge,
      publicKeyEd25519: publicKeySpkiBase64,
    };

    try {
      const targetUrl = `${this.baseUrl}/api/desktop/auth/start`;
      const res = await this.httpFetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        return {
          success: false,
          loginUrl: '',
          callbackScheme: AuthService.CALLBACK_SCHEME,
          expiresAt: '',
          errorCode: 'RATE_LIMITED',
          error: 'Too many requests. Please wait 1 minute before retrying.',
        };
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return {
          success: false,
          loginUrl: '',
          callbackScheme: AuthService.CALLBACK_SCHEME,
          expiresAt: '',
          errorCode: errJson.errorCode || 'LOGIN_REQUIRED',
          error: errJson.error || `HTTP error ${res.status}`,
        };
      }

      const data = (await res.json()) as DesktopAuthStartResponse;
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        loginUrl: '',
        callbackScheme: AuthService.CALLBACK_SCHEME,
        expiresAt: '',
        errorCode: 'LOGIN_REQUIRED',
        error: `Could not connect to ${this.baseUrl}: ${msg}`,
      };
    }
  }

  private processingCodes = new Set<string>();

  /**
   * Step 2: Handle deep-link callback cookapps-cpdf://auth?code=...&state=...
   */
  public async handleCallbackUrl(
    callbackUrl: string
  ): Promise<{ success: boolean; data?: DesktopAuthExchangeResponse; error?: string; errorCode?: AuthErrorCode }> {
    try {
      const parsed = new URL(callbackUrl);

      if (parsed.protocol !== `${AuthService.CALLBACK_SCHEME}:`) {
        return { success: false, error: 'Invalid callback scheme', errorCode: 'INVALID_STATE' };
      }

      // Check host or pathname for 'auth'
      const hostOrPath = (parsed.host || parsed.pathname).replace(/^\/+/, '');
      if (hostOrPath !== 'auth') {
        return { success: false, error: 'Invalid callback path', errorCode: 'INVALID_STATE' };
      }

      const code = parsed.searchParams.get('code');
      const state = parsed.searchParams.get('state');

      if (!code || !state) {
        return { success: false, error: 'Callback missing code or state', errorCode: 'INVALID_STATE' };
      }

      // Deduplicate concurrent callback triggers for the same code
      if (this.processingCodes.has(code)) {
        return { success: false, error: 'Callback code is already being processed', errorCode: 'INVALID_STATE' };
      }
      this.processingCodes.add(code);

      const storedState = await SecureAuthStore.getPendingState();
      const codeVerifier = await SecureAuthStore.getPendingCodeVerifier();

      // Atomically clear pending state & verifier immediately to block double exchange
      await SecureAuthStore.clearPendingFlow();

      if (!storedState || !this.constantTimeCompare(state, storedState)) {
        return { success: false, error: 'State mismatch - possible CSRF attack', errorCode: 'INVALID_STATE' };
      }

      if (!codeVerifier) {
        return { success: false, error: 'Missing pending PKCE code verifier', errorCode: 'PKCE_VERIFICATION_FAILED' };
      }

      const deviceKey = await SecureAuthStore.getOrCreateDeviceKey();
      const exchangeResult = await this.exchangeCode(code, codeVerifier, deviceKey);

      return { success: exchangeResult.success, data: exchangeResult };
    } catch (err: unknown) {
      await SecureAuthStore.clearPendingFlow();
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Callback processing error: ${message}`, errorCode: 'INVALID_STATE' };
    }
  }

  /**
   * Step 3: Exchange code and PKCE verifier for session tokens.
   */
  public async exchangeCode(
    code: string,
    codeVerifier: string,
    deviceKey: string
  ): Promise<DesktopAuthExchangeResponse> {
    const body = { code, codeVerifier, deviceKey };

    try {
      const res = await this.httpFetch(`${this.baseUrl}/api/desktop/auth/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => ({}))) as DesktopAuthExchangeResponse;

      if (!res.ok || !data.authenticated || !data.accessToken) {
        return {
          success: false,
          authenticated: false,
          errorCode: data.errorCode || 'INVALID_EXCHANGE_CODE',
          error: data.error || `Exchange failed with status ${res.status}`,
          entitlement: data.entitlement,
          activeDevices: data.activeDevices,
        };
      }

      // Store tokens securely
      await SecureAuthStore.setDesktopAccessToken(data.accessToken);
      if (data.leaseToken) await SecureAuthStore.setLeaseToken(data.leaseToken);
      if (data.leaseExpiresAt) await SecureAuthStore.setLeaseExpiresAt(data.leaseExpiresAt);
      if (data.leaseGraceUntil) await SecureAuthStore.setLeaseGraceUntil(data.leaseGraceUntil);

      // Verify lease if available & configured
      if (data.leaseToken && this.leasePublicKeyBase64) {
        const leaseCheck = await verifyLeaseTokenOffline(data.leaseToken, this.leasePublicKeyBase64);
        if (!leaseCheck.valid) {
          console.warn('Offline lease signature check warning:', leaseCheck.error);
        }
      }

      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        authenticated: false,
        errorCode: 'INVALID_EXCHANGE_CODE',
        error: `Network error during exchange with ${this.baseUrl}: ${msg}`,
      };
    }
  }

  /**
   * Session verification & device proof (GET /api/desktop/session?appSlug=cpdf).
   */
  public async verifySession(): Promise<DesktopSessionResponse> {
    const accessToken = await SecureAuthStore.getDesktopAccessToken();
    const deviceKey = await SecureAuthStore.getOrCreateDeviceKey();

    if (!accessToken) {
      return { success: false, authenticated: false, errorCode: 'LOGIN_REQUIRED' };
    }

    const { privateKey } = await this.getOrCreateDeviceKeyPair();
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = generateRandomUrlSafeString(24);

    const signature = await createDeviceProofSignature(privateKey, timestamp, nonce, AuthService.APP_SLUG);

    try {
      const res = await this.httpFetch(`${this.baseUrl}/api/desktop/session?appSlug=${AuthService.APP_SLUG}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-CookApps-Device-Key': deviceKey,
          'X-CookApps-Timestamp': String(timestamp),
          'X-CookApps-Nonce': nonce,
          'X-CookApps-Signature': signature,
        },
      });

      const data = (await res.json().catch(() => ({}))) as DesktopSessionResponse;

      if (data.errorCode === 'IP_REAUTH_REQUIRED') {
        await SecureAuthStore.clearSessionTokens();
        return {
          success: false,
          authenticated: false,
          errorCode: 'IP_REAUTH_REQUIRED',
          error: 'Public IP changed. Online re-authentication required.',
        };
      }

      if (data.errorCode === 'DEVICE_REVOKED') {
        await SecureAuthStore.clearSessionTokens();
        return {
          success: false,
          authenticated: false,
          errorCode: 'DEVICE_REVOKED',
          error: 'Device has been revoked. Please sign in again.',
        };
      }

      if (!res.ok || !data.authenticated) {
        return {
          success: false,
          authenticated: false,
          errorCode: data.errorCode || 'LOGIN_REQUIRED',
          error: data.error || `Session check failed with HTTP ${res.status}`,
        };
      }

      if (data.leaseToken) await SecureAuthStore.setLeaseToken(data.leaseToken);
      if (data.leaseExpiresAt) await SecureAuthStore.setLeaseExpiresAt(data.leaseExpiresAt);
      if (data.leaseGraceUntil) await SecureAuthStore.setLeaseGraceUntil(data.leaseGraceUntil);

      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        authenticated: false,
        errorCode: 'LOGIN_REQUIRED',
        error: `Network error verifying session with ${this.baseUrl}: ${msg}`,
      };
    }
  }

  /**
   * Verifies offline lease state based on stored lease token and timestamps.
   */
  public async checkOfflineLease(): Promise<{
    allowed: boolean;
    reason: 'VALID' | 'GRACE_PERIOD' | 'EXPIRED' | 'NO_LEASE' | 'INVALID_SIGNATURE';
    payload?: LeasePayload;
  }> {
    const leaseToken = await SecureAuthStore.getLeaseToken();
    const expiresAt = await SecureAuthStore.getLeaseExpiresAt();
    const graceUntil = await SecureAuthStore.getLeaseGraceUntil();

    if (!leaseToken) {
      return { allowed: false, reason: 'NO_LEASE' };
    }

    if (this.leasePublicKeyBase64) {
      const verifyRes = await verifyLeaseTokenOffline(leaseToken, this.leasePublicKeyBase64);
      if (!verifyRes.valid || !verifyRes.payload) {
        return { allowed: false, reason: 'INVALID_SIGNATURE' };
      }

      if (!verifyRes.payload.app_entitlements.includes(AuthService.APP_SLUG) || !verifyRes.payload.entitlement_allowed) {
        return { allowed: false, reason: 'EXPIRED', payload: verifyRes.payload };
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const effectiveExpires = expiresAt || verifyRes.payload.expires_at;
      const effectiveGrace = graceUntil || verifyRes.payload.grace_until;

      if (!effectiveExpires || nowSec <= effectiveExpires) {
        return { allowed: true, reason: 'VALID', payload: verifyRes.payload };
      }

      if (effectiveGrace && nowSec <= effectiveGrace) {
        return { allowed: true, reason: 'GRACE_PERIOD', payload: verifyRes.payload };
      }

      return { allowed: false, reason: 'EXPIRED', payload: verifyRes.payload };
    }

    // If lease public key not provided, check timestamp policy
    const nowSec = Math.floor(Date.now() / 1000);
    if (!expiresAt || nowSec <= expiresAt) {
      return { allowed: true, reason: 'VALID' };
    }
    if (graceUntil && nowSec <= graceUntil) {
      return { allowed: true, reason: 'GRACE_PERIOD' };
    }

    return { allowed: false, reason: 'EXPIRED' };
  }
}
