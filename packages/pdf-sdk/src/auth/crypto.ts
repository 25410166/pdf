// Copyright (c) 2026 Casual Office
// SPDX-License-Identifier: Apache-2.0

import type { LeasePayload } from './types.ts';

// Helper for Base64 and Base64URL encoding/decoding
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlToBytes(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }
  return base64ToBytes(b64);
}

export function stringToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return bytesToBase64Url(bytes);
}

export function base64UrlToString(b64url: string): string {
  const bytes = base64UrlToBytes(b64url);
  return new TextDecoder().decode(bytes);
}

/**
 * Generates URL-safe random string for PKCE verifier / state / nonce.
 */
export function generateRandomUrlSafeString(length: number): string {
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  return bytesToBase64Url(randomBytes).slice(0, length);
}

/**
 * Creates PKCE S256 code challenge: base64url(SHA-256(codeVerifier))
 */
export async function createPkceChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToBase64Url(new Uint8Array(digest));
}

/**
 * Generates Ed25519 key pair for device binding.
 */
export async function generateDeviceKeyPair(): Promise<{
  publicKeySpkiBase64: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}> {
  const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;

  const spkiBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicKeySpkiBase64 = bytesToBase64(new Uint8Array(spkiBuffer));

  return {
    publicKeySpkiBase64,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
  };
}

/**
 * Exports private key to JWK for persistent storage.
 */
export async function exportPrivateKeyJwk(privateKey: CryptoKey): Promise<JsonWebKey> {
  return await crypto.subtle.exportKey('jwk', privateKey);
}

/**
 * Imports private key from JWK.
 */
export async function importPrivateKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'Ed25519' },
    true,
    ['sign']
  );
}

/**
 * Signs device proof for GET /api/desktop/session?appSlug=cpdf
 * UTF-8 message:
 * GET
 * /api/desktop/session?appSlug=cpdf
 * {timestamp}
 * {nonce}
 */
export async function createDeviceProofSignature(
  privateKey: CryptoKey,
  timestampSeconds: number,
  nonce: string,
  appSlug = 'cpdf'
): Promise<string> {
  const message = `GET\n/api/desktop/session?appSlug=${appSlug}\n${timestampSeconds}\n${nonce}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const sigBuf = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, data);
  return bytesToBase64Url(new Uint8Array(sigBuf));
}

/**
 * Verifies Ed25519 lease token offline.
 * Lease format: base64url(JSON payload).base64url(Ed25519 signature)
 */
export async function verifyLeaseTokenOffline(
  leaseToken: string,
  leasePublicKeyBase64: string
): Promise<{ valid: boolean; payload?: LeasePayload; error?: string }> {
  if (!leaseToken || !leasePublicKeyBase64) {
    return { valid: false, error: 'Missing token or public key' };
  }

  const parts = leaseToken.split('.');
  if (parts.length !== 2 && parts.length !== 3) {
    return { valid: false, error: 'Lease token must consist of 2 or 3 parts separated by .' };
  }

  const payloadB64Url = parts.length === 3 ? parts[1] : parts[0];
  const sigB64Url = parts.length === 3 ? parts[2] : parts[1];
  const headerB64Url = parts.length === 3 ? parts[0] : null;

  try {
    const keyBytes = base64ToBytes(leasePublicKeyBase64);
    const keyBuffer = keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer;

    const pubKeys: CryptoKey[] = [];

    // Attempt 1: Import as SPKI
    try {
      const k = await crypto.subtle.importKey('spki', keyBuffer, { name: 'Ed25519' }, true, ['verify']);
      pubKeys.push(k);
    } catch {
      /* fallback */
    }

    // Attempt 2: Import as RAW
    try {
      const k = await crypto.subtle.importKey('raw', keyBuffer, { name: 'Ed25519' }, true, ['verify']);
      pubKeys.push(k);
    } catch {
      /* fallback */
    }

    // Attempt 3: If keyBuffer is SPKI (>= 32 bytes), extract last 32 bytes and import as RAW
    if (keyBuffer.byteLength >= 32) {
      try {
        const raw32 = keyBuffer.slice(keyBuffer.byteLength - 32);
        const k = await crypto.subtle.importKey('raw', raw32, { name: 'Ed25519' }, true, ['verify']);
        pubKeys.push(k);
      } catch {
        /* fallback */
      }
    }

    if (pubKeys.length === 0) {
      return { valid: false, error: 'Failed to import Ed25519 public key' };
    }

    const sigBytes = base64UrlToBytes(sigB64Url);
    const sigBuffer = sigBytes.buffer.slice(sigBytes.byteOffset, sigBytes.byteOffset + sigBytes.byteLength) as ArrayBuffer;

    // Build message candidates to verify against
    const messageCandidates: ArrayBuffer[] = [];

    if (headerB64Url) {
      // Standard JWT format: header.payload
      const jwsHeaderPayload = `${headerB64Url}.${payloadB64Url}`;
      messageCandidates.push(new TextEncoder().encode(jwsHeaderPayload).buffer as ArrayBuffer);
    }

    // Encoded payload string
    messageCandidates.push(new TextEncoder().encode(payloadB64Url).buffer as ArrayBuffer);

    // Raw decoded payload bytes
    const rawPayloadBytes = base64UrlToBytes(payloadB64Url);
    messageCandidates.push(
      rawPayloadBytes.buffer.slice(rawPayloadBytes.byteOffset, rawPayloadBytes.byteOffset + rawPayloadBytes.byteLength) as ArrayBuffer
    );

    let isValid = false;

    for (const pubKey of pubKeys) {
      for (const msgBuf of messageCandidates) {
        try {
          const check = await crypto.subtle.verify({ name: 'Ed25519' }, pubKey, sigBuffer, msgBuf);
          if (check) {
            isValid = true;
            break;
          }
        } catch {
          /* try next candidate */
        }
      }
      if (isValid) break;
    }

    if (!isValid) {
      return { valid: false, error: 'Ed25519 signature verification failed' };
    }

    const payloadJson = base64UrlToString(payloadB64Url);
    const payload = JSON.parse(payloadJson) as LeasePayload;

    return { valid: true, payload };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Lease verification error: ${message}` };
  }
}
