// Copyright (c) 2026 Casual Office
// SPDX-License-Identifier: Apache-2.0

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AuthService,
  SecureAuthStore,
  createDeviceProofSignature,
  createPkceChallenge,
  generateDeviceKeyPair,
  generateRandomUrlSafeString,
  verifyLeaseTokenOffline,
  bytesToBase64,
  bytesToBase64Url,
} from '../../packages/pdf-sdk/src/auth/index.ts';

test('deviceKey format matches server requirement ^[A-Za-z0-9._:-]{8,160}$', async () => {
  const deviceKey = await SecureAuthStore.getOrCreateDeviceKey();
  assert.ok(deviceKey.startsWith('cpdf-'));
  const regex = /^[A-Za-z0-9._:-]{8,160}$/;
  assert.ok(regex.test(deviceKey), `deviceKey ${deviceKey} does not match regex`);

  // Same key returned on second read
  const secondKey = await SecureAuthStore.getOrCreateDeviceKey();
  assert.equal(deviceKey, secondKey);
});

test('PKCE S256 code challenge generation', async () => {
  const verifier = generateRandomUrlSafeString(64);
  assert.equal(verifier.length, 64);

  const challenge = await createPkceChallenge(verifier);
  assert.ok(challenge.length > 0);
  assert.ok(!challenge.includes('+'));
  assert.ok(!challenge.includes('/'));
  assert.ok(!challenge.includes('='));
});

test('Ed25519 device keypair generation and SPKI Base64 export', async () => {
  const { publicKeySpkiBase64, privateKey } = await generateDeviceKeyPair();
  assert.ok(publicKeySpkiBase64.length > 0);
  assert.equal(privateKey.algorithm.name, 'Ed25519');
});

test('Ed25519 device proof signature generation', async () => {
  const { privateKey } = await generateDeviceKeyPair();
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = generateRandomUrlSafeString(24);

  const signature = await createDeviceProofSignature(privateKey, timestamp, nonce, 'cpdf');
  assert.ok(signature.length > 0);
  assert.ok(!signature.includes('+'));
  assert.ok(!signature.includes('/'));
});

test('Ed25519 lease token signature verification offline', async () => {
  // Generate a keypair acting as server lease key
  const serverKeyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;

  const spkiBuf = await crypto.subtle.exportKey('spki', serverKeyPair.publicKey);
  const serverPublicKeyBase64 = bytesToBase64(new Uint8Array(spkiBuf));

  const payloadObj = {
    version: 1,
    user_id: 'usr_123',
    device_id: 'dev_456',
    app_entitlements: ['cpdf'],
    entitlement_allowed: true,
    issued_at: Math.floor(Date.now() / 1000),
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    grace_until: Math.floor(Date.now() / 1000) + 172800,
  };

  const payloadB64Url = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payloadObj)));
  const sigBuf = await crypto.subtle.sign(
    { name: 'Ed25519' },
    serverKeyPair.privateKey,
    new TextEncoder().encode(payloadB64Url)
  );
  const sigB64Url = bytesToBase64Url(new Uint8Array(sigBuf));

  const leaseToken = `${payloadB64Url}.${sigB64Url}`;

  const result = await verifyLeaseTokenOffline(leaseToken, serverPublicKeyBase64);
  assert.equal(result.valid, true);
  assert.equal(result.payload?.user_id, 'usr_123');
  assert.equal(result.payload?.app_entitlements[0], 'cpdf');
});

test('Validates production SPKI lease public key importability', async () => {
  const prodPublicKeyBase64 = 'MCowBQYDK2VwAyEAvSTxJ6EC0pASM2tyZYWRB7MZ7KTw/g3g03FwGPIh+EM=';
  const service = new AuthService();
  assert.equal(service.getLeasePublicKeyBase64(), prodPublicKeyBase64);

  // Test WebCrypto importKey with the production SPKI key
  const spkiBytes = new Uint8Array(Buffer.from(prodPublicKeyBase64, 'base64'));
  const pubKey = await crypto.subtle.importKey(
    'spki',
    spkiBytes.buffer,
    { name: 'Ed25519' },
    true,
    ['verify']
  );
  assert.ok(pubKey);
  assert.equal(pubKey.algorithm.name, 'Ed25519');
});

test('Callback URL parsing and state validation', async () => {
  const service = new AuthService();
  const state = 'test_state_1234567890';
  await SecureAuthStore.setPendingState(state);
  await SecureAuthStore.setPendingCodeVerifier('test_verifier_1234567890');

  // Mismatched state should be rejected
  const badResult = await service.handleCallbackUrl('cookapps-cpdf://auth?code=123&state=wrong_state');
  assert.equal(badResult.success, false);
  assert.equal(badResult.errorCode, 'INVALID_STATE');

  // Stored pending state must be cleared after invalid callback
  const clearedState = await SecureAuthStore.getPendingState();
  assert.equal(clearedState, null);
});
