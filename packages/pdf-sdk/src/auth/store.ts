// Copyright (c) 2026 Casual Office
// SPDX-License-Identifier: Apache-2.0

import { generateRandomUrlSafeString } from './crypto.ts';

export class SecureAuthStore {
  private static prefix = 'cpdf.';

  private static memoryStore = new Map<string, string>();

  private static async getRaw(key: string): Promise<string | null> {
    const fullKey = `${SecureAuthStore.prefix}${key}`;
    if (typeof window !== 'undefined' && window.__deskApp__?.tokenGet) {
      try {
        const val = await window.__deskApp__.tokenGet(fullKey);
        if (val) return val;
      } catch {
        // Fallback to localStorage/memory
      }
    }
    if (typeof localStorage !== 'undefined') {
      const lsVal = localStorage.getItem(fullKey);
      if (lsVal !== null) return lsVal;
    }
    return SecureAuthStore.memoryStore.get(fullKey) || null;
  }

  private static async setRaw(key: string, value: string | null): Promise<void> {
    const fullKey = `${SecureAuthStore.prefix}${key}`;
    if (value === null) {
      SecureAuthStore.memoryStore.delete(fullKey);
    } else {
      SecureAuthStore.memoryStore.set(fullKey, value);
    }

    if (typeof localStorage !== 'undefined') {
      if (value === null) {
        localStorage.removeItem(fullKey);
      } else {
        localStorage.setItem(fullKey, value);
      }
    }

    if (typeof window !== 'undefined' && window.__deskApp__?.tokenSet) {
      try {
        await window.__deskApp__.tokenSet(fullKey, value ?? '');
      } catch {
        // Fallback to localStorage/memory
      }
    }
  }

  /**
   * Loads or creates a stable installation device key matching ^[A-Za-z0-9._:-]{8,160}$
   */
  public static async getOrCreateDeviceKey(): Promise<string> {
    let key = await SecureAuthStore.getRaw('deviceKey');
    if (!key) {
      const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : generateRandomUrlSafeString(32);
      key = `cpdf-${uuid}`;
      await SecureAuthStore.setRaw('deviceKey', key);
    }
    return key;
  }

  public static async getDevicePrivateKeyJwk(): Promise<JsonWebKey | null> {
    const raw = await SecureAuthStore.getRaw('devicePrivateKey');
    return raw ? (JSON.parse(raw) as JsonWebKey) : null;
  }

  public static async setDevicePrivateKeyJwk(jwk: JsonWebKey): Promise<void> {
    await SecureAuthStore.setRaw('devicePrivateKey', JSON.stringify(jwk));
  }

  public static async getDevicePublicKeySpki(): Promise<string | null> {
    return await SecureAuthStore.getRaw('devicePublicKey');
  }

  public static async setDevicePublicKeySpki(spkiBase64: string): Promise<void> {
    await SecureAuthStore.setRaw('devicePublicKey', spkiBase64);
  }

  public static async getPendingState(): Promise<string | null> {
    return await SecureAuthStore.getRaw('pending.state');
  }

  public static async setPendingState(state: string | null): Promise<void> {
    await SecureAuthStore.setRaw('pending.state', state);
  }

  public static async getPendingCodeVerifier(): Promise<string | null> {
    return await SecureAuthStore.getRaw('pending.codeVerifier');
  }

  public static async setPendingCodeVerifier(verifier: string | null): Promise<void> {
    await SecureAuthStore.setRaw('pending.codeVerifier', verifier);
  }

  public static async clearPendingFlow(): Promise<void> {
    await SecureAuthStore.setPendingState(null);
    await SecureAuthStore.setPendingCodeVerifier(null);
  }

  public static async getDesktopAccessToken(): Promise<string | null> {
    return await SecureAuthStore.getRaw('desktopAccessToken');
  }

  public static async setDesktopAccessToken(token: string | null): Promise<void> {
    await SecureAuthStore.setRaw('desktopAccessToken', token);
  }

  public static async getLeaseToken(): Promise<string | null> {
    return await SecureAuthStore.getRaw('leaseToken');
  }

  public static async setLeaseToken(leaseToken: string | null): Promise<void> {
    await SecureAuthStore.setRaw('leaseToken', leaseToken);
  }

  public static parseTimestampToSeconds(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
      return value > 10000000000 ? Math.floor(value / 1000) : Math.floor(value);
    }
    const str = String(value).trim();
    if (/^\d+$/.test(str)) {
      const num = parseInt(str, 10);
      return num > 10000000000 ? Math.floor(num / 1000) : num;
    }
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) {
      return Math.floor(parsed / 1000);
    }
    return null;
  }

  public static async getLeaseExpiresAt(): Promise<number | null> {
    const raw = await SecureAuthStore.getRaw('leaseExpiresAt');
    return SecureAuthStore.parseTimestampToSeconds(raw);
  }

  public static async setLeaseExpiresAt(value: string | number | null): Promise<void> {
    const sec = SecureAuthStore.parseTimestampToSeconds(value);
    await SecureAuthStore.setRaw('leaseExpiresAt', sec !== null ? String(sec) : null);
  }

  public static async getLeaseGraceUntil(): Promise<number | null> {
    const raw = await SecureAuthStore.getRaw('leaseGraceUntil');
    return SecureAuthStore.parseTimestampToSeconds(raw);
  }

  public static async setLeaseGraceUntil(value: string | number | null): Promise<void> {
    const sec = SecureAuthStore.parseTimestampToSeconds(value);
    await SecureAuthStore.setRaw('leaseGraceUntil', sec !== null ? String(sec) : null);
  }

  public static async clearSessionTokens(): Promise<void> {
    await SecureAuthStore.setDesktopAccessToken(null);
    await SecureAuthStore.setLeaseToken(null);
    await SecureAuthStore.setLeaseExpiresAt(null);
    await SecureAuthStore.setLeaseGraceUntil(null);
  }
}
