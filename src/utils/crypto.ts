import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { concatBytes } from '@noble/post-quantum/utils.js';

// Helper to convert Uint8Array to Base64
export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

// Helper to convert Base64 to Uint8Array
export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export interface PQCKeyPair {
  publicKey: string;
  privateKey: string;
}

export interface VaultIdentity {
  id: string;
  name: string;
  keys: PQCKeyPair;
}

export interface VaultContact {
  id: string;
  name: string;
  publicKey: string;
}

export interface KhaznaVault {
  identities: VaultIdentity[];
  contacts: VaultContact[];
}

/**
 * Generates a new ML-KEM-768 keypair.
 */
export function generateKeyPair(): PQCKeyPair {
  const keys = ml_kem768.keygen();
  return {
    publicKey: bytesToBase64(keys.publicKey),
    privateKey: bytesToBase64(keys.secretKey),
  };
}

/**
 * Encrypts a message using ML-KEM-768 + AES-256-GCM.
 */
export function encryptMessage(message: string, recipientPublicKeyB64: string): string {
  const publicKey = base64ToBytes(recipientPublicKeyB64);
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(message);

  const { cipherText: kemCipherText, sharedSecret } = ml_kem768.encapsulate(publicKey);
  const aesKey = sha256(sharedSecret);
  const nonce = randomBytes(12);
  const aes = gcm(aesKey, nonce);
  const encryptedPayload = aes.encrypt(messageBytes);

  const bundle = concatBytes(kemCipherText, nonce, encryptedPayload);
  return bytesToBase64(bundle);
}

/**
 * Decrypts a message bundle.
 */
export function decryptMessage(bundleB64: string, privateKeyB64: string): string {
  const bundle = base64ToBytes(bundleB64);
  const privateKey = base64ToBytes(privateKeyB64);

  const KEM_SIZE = 1088;
  const NONCE_SIZE = 12;

  if (bundle.length < KEM_SIZE + NONCE_SIZE) throw new Error('Invalid encrypted bundle');

  const kemCipherText = bundle.slice(0, KEM_SIZE);
  const nonce = bundle.slice(KEM_SIZE, KEM_SIZE + NONCE_SIZE);
  const encryptedPayload = bundle.slice(KEM_SIZE + NONCE_SIZE);

  const sharedSecret = ml_kem768.decapsulate(kemCipherText, privateKey);
  const aesKey = sha256(sharedSecret);
  const aes = gcm(aesKey, nonce);
  const decryptedBytes = aes.decrypt(encryptedPayload);

  return new TextDecoder().decode(decryptedBytes);
}

/**
 * Encrypts a file using ML-KEM-768 + AES-256-GCM.
 */
export async function encryptFile(file: File, recipientPublicKeyB64: string): Promise<Uint8Array> {
  const publicKey = base64ToBytes(recipientPublicKeyB64);
  const fileBuffer = await file.arrayBuffer();
  const fileBytes = new Uint8Array(fileBuffer);

  const { cipherText: kemCipherText, sharedSecret } = ml_kem768.encapsulate(publicKey);
  const aesKey = sha256(sharedSecret);
  const nonce = randomBytes(12);
  const aes = gcm(aesKey, nonce);
  const encryptedPayload = aes.encrypt(fileBytes);

  return concatBytes(kemCipherText, nonce, encryptedPayload);
}

/**
 * Decrypts a file bundle.
 */
export function decryptFile(bundle: Uint8Array, privateKeyB64: string): Uint8Array {
  const privateKey = base64ToBytes(privateKeyB64);
  const KEM_SIZE = 1088;
  const NONCE_SIZE = 12;

  if (bundle.length < KEM_SIZE + NONCE_SIZE) throw new Error('Invalid file bundle');

  const kemCipherText = bundle.slice(0, KEM_SIZE);
  const nonce = bundle.slice(KEM_SIZE, KEM_SIZE + NONCE_SIZE);
  const encryptedPayload = bundle.slice(KEM_SIZE + NONCE_SIZE);

  const sharedSecret = ml_kem768.decapsulate(kemCipherText, privateKey);
  const aesKey = sha256(sharedSecret);
  const aes = gcm(aesKey, nonce);
  return aes.decrypt(encryptedPayload);
}

/**
 * Password-protects a single PQC identity.
 */
export async function protectIdentity(keys: PQCKeyPair, password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await pbkdf2(sha256, password, salt, { c: 100000, dkLen: 32 });
  const nonce = randomBytes(12);
  const aes = gcm(derivedKey, nonce);
  const encryptedPrivateKey = aes.encrypt(base64ToBytes(keys.privateKey));
  const publicKeyBytes = base64ToBytes(keys.publicKey);
  return bytesToBase64(concatBytes(salt, nonce, encryptedPrivateKey, publicKeyBytes));
}

/**
 * Recovers a single PQC identity.
 */
export async function unprotectIdentity(storageB64: string, password: string): Promise<PQCKeyPair> {
  const bundle = base64ToBytes(storageB64);
  const salt = bundle.slice(0, 16);
  const nonce = bundle.slice(16, 28);
  const encryptedPrivateKey = bundle.slice(28, bundle.length - 1184);
  const publicKey = bundle.slice(bundle.length - 1184);
  const derivedKey = await pbkdf2(sha256, password, salt, { c: 100000, dkLen: 32 });
  const aes = gcm(derivedKey, nonce);
  const privateKey = aes.decrypt(encryptedPrivateKey);
  return {
    publicKey: bytesToBase64(publicKey),
    privateKey: bytesToBase64(privateKey)
  };
}

/**
 * Encrypts the entire vault using a master password.
 */
export async function encryptVault(vault: KhaznaVault, password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await pbkdf2(sha256, password, salt, { c: 100000, dkLen: 32 });
  const nonce = randomBytes(12);
  const aes = gcm(derivedKey, nonce);
  const vaultJson = JSON.stringify(vault);
  const encryptedData = aes.encrypt(new TextEncoder().encode(vaultJson));
  return bytesToBase64(concatBytes(salt, nonce, encryptedData));
}

/**
 * Decrypts the vault using the master password.
 */
export async function decryptVault(bundleB64: string, password: string): Promise<KhaznaVault> {
  const bundle = base64ToBytes(bundleB64);
  const salt = bundle.slice(0, 16);
  const nonce = bundle.slice(16, 28);
  const encryptedData = bundle.slice(28);
  const derivedKey = await pbkdf2(sha256, password, salt, { c: 100000, dkLen: 32 });
  const aes = gcm(derivedKey, nonce);
  const decryptedBytes = aes.decrypt(encryptedData);
  const vaultJson = new TextDecoder().decode(decryptedBytes);
  return JSON.parse(vaultJson);
}
