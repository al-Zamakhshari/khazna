import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { concatBytes } from '@noble/post-quantum/utils.js';
import { x25519 } from '@noble/curves/ed25519.js';

// ── Size constants (bytes) ────────────────────────────────────────────────────
const MLKEM_PK_SIZE  = 1184;
const MLKEM_SK_SIZE  = 2400;
const MLKEM_CT_SIZE  = 1088;
const X25519_SIZE    = 32;
const NONCE_SIZE     = 12;

export const HYBRID_PK_SIZE   = MLKEM_PK_SIZE + X25519_SIZE;  // 1216
export const HYBRID_SK_SIZE   = MLKEM_SK_SIZE + X25519_SIZE;  // 2432
const BUNDLE_HEADER_SIZE      = MLKEM_CT_SIZE + X25519_SIZE + NONCE_SIZE; // 1132

// Minimum base64 lengths for input validation in the UI
export const MIN_PUBLIC_KEY_LEN  = Math.floor(HYBRID_PK_SIZE * 4 / 3);  // 1621
export const MIN_PRIVATE_KEY_LEN = Math.floor(HYBRID_SK_SIZE * 4 / 3);  // 3242

export const VAULT_KEY          = 'khazna_v3_vault';
const PBKDF2_ITERATIONS         = 100_000;
const HKDF_INFO                 = new TextEncoder().encode('khazna-hybrid-v1');
export const SESSION_TTL_MS     = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Base64 helpers ────────────────────────────────────────────────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PQCKeyPair {
  publicKey: string;   // base64( mlkem_pub(1184) || x25519_pub(32) )
  privateKey: string;  // base64( mlkem_sk(2400)  || x25519_sk(32)  )
}

export interface VaultIdentity {
  id: string;
  name: string;
  keys: PQCKeyPair;
}

export interface VaultContact {
  id: string;
  name: string;
  publicKey: string;       // long-term key — never changes
  nostrPubkey?: string;
  sessionPublicKey?: string;    // cached from their Nostr profile
  sessionFetchedAt?: number;    // unix ms — for cache staleness check
}

export interface SessionKey {
  keys:   PQCKeyPair;
  expiry: number; // unix ms
}

// One-time prekey: public half published to Nostr, private half kept in vault until consumed.
export interface StoredPrekey {
  id:   string;     // UUID referenced in KhaznaPayload.prekeyId
  keys: PQCKeyPair;
}

export interface KhaznaVault {
  identities:      VaultIdentity[];
  contacts:        VaultContact[];
  nostrPrivateKey?: string;      // hex secp256k1 — identity + routing
  sessionKey?:     SessionKey;   // rotating PQC key — time-window forward secrecy
  prekeys?:        StoredPrekey[]; // one-time prekeys — per-message forward secrecy
}

// ── Hybrid KEM core ───────────────────────────────────────────────────────────

function hybridEncapsulate(recipientPublicKeyB64: string): {
  kemCT: Uint8Array;
  ephemeralPub: Uint8Array;
  aesKey: Uint8Array;
} {
  const pubKeyBytes = base64ToBytes(recipientPublicKeyB64);
  const mlkemPub  = pubKeyBytes.slice(0, MLKEM_PK_SIZE);
  const x25519Pub = pubKeyBytes.slice(MLKEM_PK_SIZE);

  const { cipherText: kemCT, sharedSecret: ssMlkem } = ml_kem768.encapsulate(mlkemPub);

  const ephemeral  = x25519.keygen();
  const ssX25519   = x25519.getSharedSecret(ephemeral.secretKey, x25519Pub);

  const aesKey = hkdf(sha256, concatBytes(ssMlkem, ssX25519), undefined, HKDF_INFO, 32);
  return { kemCT, ephemeralPub: ephemeral.publicKey, aesKey };
}

function hybridDecapsulate(
  kemCT: Uint8Array,
  ephemeralPub: Uint8Array,
  privateKeyB64: string,
): Uint8Array {
  const privKeyBytes = base64ToBytes(privateKeyB64);
  const mlkemSk  = privKeyBytes.slice(0, MLKEM_SK_SIZE);
  const x25519Sk = privKeyBytes.slice(MLKEM_SK_SIZE);

  const ssMlkem  = ml_kem768.decapsulate(kemCT, mlkemSk);
  const ssX25519 = x25519.getSharedSecret(x25519Sk, ephemeralPub);

  return hkdf(sha256, concatBytes(ssMlkem, ssX25519), undefined, HKDF_INFO, 32);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateSessionKey(): SessionKey {
  return { keys: generateKeyPair(), expiry: Date.now() + SESSION_TTL_MS };
}

export function isSessionExpired(session: SessionKey): boolean {
  return Date.now() > session.expiry;
}

export function generateKeyPair(): PQCKeyPair {
  const mlkem = ml_kem768.keygen();
  const curve = x25519.keygen();
  return {
    publicKey:  bytesToBase64(concatBytes(mlkem.publicKey, curve.publicKey)),
    privateKey: bytesToBase64(concatBytes(mlkem.secretKey, curve.secretKey)),
  };
}

export function encryptMessage(message: string, recipientPublicKeyB64: string): string {
  const { kemCT, ephemeralPub, aesKey } = hybridEncapsulate(recipientPublicKeyB64);
  const nonce = randomBytes(NONCE_SIZE);
  const ciphertext = gcm(aesKey, nonce).encrypt(new TextEncoder().encode(message));
  return bytesToBase64(concatBytes(kemCT, ephemeralPub, nonce, ciphertext));
}

export function decryptMessage(bundleB64: string, privateKeyB64: string): string {
  const bundle = base64ToBytes(bundleB64);
  if (bundle.length < BUNDLE_HEADER_SIZE) throw new Error('Invalid encrypted bundle');

  const kemCT      = bundle.slice(0, MLKEM_CT_SIZE);
  const ephemeralPub = bundle.slice(MLKEM_CT_SIZE, MLKEM_CT_SIZE + X25519_SIZE);
  const nonce      = bundle.slice(MLKEM_CT_SIZE + X25519_SIZE, BUNDLE_HEADER_SIZE);
  const ciphertext = bundle.slice(BUNDLE_HEADER_SIZE);

  const aesKey = hybridDecapsulate(kemCT, ephemeralPub, privateKeyB64);
  return new TextDecoder().decode(gcm(aesKey, nonce).decrypt(ciphertext));
}

export async function encryptFile(file: File, recipientPublicKeyB64: string): Promise<Uint8Array> {
  const { kemCT, ephemeralPub, aesKey } = hybridEncapsulate(recipientPublicKeyB64);
  const nonce = randomBytes(NONCE_SIZE);
  const ciphertext = gcm(aesKey, nonce).encrypt(new Uint8Array(await file.arrayBuffer()));
  return concatBytes(kemCT, ephemeralPub, nonce, ciphertext);
}

export function decryptFile(bundle: Uint8Array, privateKeyB64: string): Uint8Array {
  if (bundle.length < BUNDLE_HEADER_SIZE) throw new Error('Invalid file bundle');

  const kemCT      = bundle.slice(0, MLKEM_CT_SIZE);
  const ephemeralPub = bundle.slice(MLKEM_CT_SIZE, MLKEM_CT_SIZE + X25519_SIZE);
  const nonce      = bundle.slice(MLKEM_CT_SIZE + X25519_SIZE, BUNDLE_HEADER_SIZE);
  const ciphertext = bundle.slice(BUNDLE_HEADER_SIZE);

  const aesKey = hybridDecapsulate(kemCT, ephemeralPub, privateKeyB64);
  return gcm(aesKey, nonce).decrypt(ciphertext);
}

export async function encryptVault(vault: KhaznaVault, password: string): Promise<string> {
  const salt       = randomBytes(16);
  const derivedKey = await pbkdf2Async(sha256, password, salt, { c: PBKDF2_ITERATIONS, dkLen: 32 });
  const nonce      = randomBytes(NONCE_SIZE);
  const encrypted  = gcm(derivedKey, nonce).encrypt(new TextEncoder().encode(JSON.stringify(vault)));
  return bytesToBase64(concatBytes(salt, nonce, encrypted));
}

export async function decryptVault(bundleB64: string, password: string): Promise<KhaznaVault> {
  const bundle     = base64ToBytes(bundleB64);
  const salt       = bundle.slice(0, 16);
  const nonce      = bundle.slice(16, 28);
  const encrypted  = bundle.slice(28);
  const derivedKey = await pbkdf2Async(sha256, password, salt, { c: PBKDF2_ITERATIONS, dkLen: 32 });
  return JSON.parse(new TextDecoder().decode(gcm(derivedKey, nonce).decrypt(encrypted)));
}

export async function protectIdentity(keys: PQCKeyPair, password: string): Promise<string> {
  const salt       = randomBytes(16);
  const derivedKey = await pbkdf2Async(sha256, password, salt, { c: PBKDF2_ITERATIONS, dkLen: 32 });
  const nonce      = randomBytes(NONCE_SIZE);
  const encPrivKey = gcm(derivedKey, nonce).encrypt(base64ToBytes(keys.privateKey));
  const pubKeyBytes = base64ToBytes(keys.publicKey);
  return bytesToBase64(concatBytes(salt, nonce, encPrivKey, pubKeyBytes));
}

export async function unprotectIdentity(storageB64: string, password: string): Promise<PQCKeyPair> {
  const bundle      = base64ToBytes(storageB64);
  const salt        = bundle.slice(0, 16);
  const nonce       = bundle.slice(16, 28);
  const encPrivKey  = bundle.slice(28, bundle.length - HYBRID_PK_SIZE);
  const publicKey   = bundle.slice(bundle.length - HYBRID_PK_SIZE);
  const derivedKey  = await pbkdf2Async(sha256, password, salt, { c: PBKDF2_ITERATIONS, dkLen: 32 });
  const privateKey  = gcm(derivedKey, nonce).decrypt(encPrivKey);
  return {
    publicKey:  bytesToBase64(publicKey),
    privateKey: bytesToBase64(privateKey),
  };
}
