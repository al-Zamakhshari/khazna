/**
 * Shamir Secret Sharing over GF(2^8)
 *
 * Splits a secret (Uint8Array) into `shares` parts where any `threshold`
 * of them can reconstruct the original.
 *
 * Field: GF(256) with irreducible polynomial x^8 + x^4 + x^3 + x + 1 (0x11b).
 * Each share is a Uint8Array of length secret.length + 1:
 *   byte 0:    x-coordinate (1-indexed, 1..shares)
 *   bytes 1…n: f(x) for each byte of the secret
 */

import { randomBytes } from '@noble/ciphers/utils.js';
import { bytesToBase64, base64ToBytes } from './crypto';

// ── GF(256) arithmetic ────────────────────────────────────────────────────────

function gf256_mul(a: number, b: number): number {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b; // reduce mod (x^8 + x^4 + x^3 + x + 1)
    b >>= 1;
  }
  return p;
}

function gf256_pow(base: number, exp: number): number {
  let result = 1;
  while (exp > 0) {
    if (exp & 1) result = gf256_mul(result, base);
    base = gf256_mul(base, base);
    exp >>= 1;
  }
  return result;
}

/** Multiplicative inverse via Fermat's little theorem: a^(2^8 - 2) = a^-1 in GF(2^8). */
function gf256_inv(a: number): number {
  if (a === 0) throw new Error('gf256_inv: no inverse for 0');
  return gf256_pow(a, 254);
}

/** Evaluate polynomial (coefficients LSB-first) at x in GF(256). */
function evalPoly(poly: Uint8Array, x: number): number {
  let result = 0;
  for (let i = poly.length - 1; i >= 0; i--) {
    result = gf256_mul(result, x) ^ poly[i];
  }
  return result;
}

/** Lagrange interpolation at x=0 to recover f(0) from (xs, ys) points. */
function lagrangeAtZero(xs: Uint8Array, ys: Uint8Array): number {
  let result = 0;
  for (let i = 0; i < xs.length; i++) {
    let num = 1;
    let den = 1;
    for (let j = 0; j < xs.length; j++) {
      if (i === j) continue;
      num = gf256_mul(num, xs[j]);              // product of x_j
      den = gf256_mul(den, xs[i] ^ xs[j]);      // product of (x_i - x_j); in GF(2^8), - === XOR
    }
    result ^= gf256_mul(gf256_mul(num, gf256_inv(den)), ys[i]);
  }
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Split `secret` into `totalShares` shares; any `threshold` shares suffice
 * to reconstruct it.
 *
 * @throws if threshold < 2, threshold > totalShares, or totalShares > 255.
 */
export function splitSecret(
  secret:      Uint8Array,
  threshold:   number,
  totalShares: number,
): Uint8Array[] {
  if (threshold < 2)             throw new Error('Threshold must be at least 2');
  if (threshold > totalShares)   throw new Error('Threshold cannot exceed total shares');
  if (totalShares > 255)         throw new Error('Maximum 255 shares supported');
  if (secret.length === 0)       throw new Error('Secret must not be empty');

  // Each output share: [x, y_0, y_1, ..., y_{n-1}]
  const shares: Uint8Array[] = Array.from({ length: totalShares }, () =>
    new Uint8Array(secret.length + 1),
  );
  for (let s = 0; s < totalShares; s++) shares[s][0] = s + 1; // x-coordinates: 1..totalShares

  // For each byte of the secret, create a random (threshold-1)-degree polynomial
  // with f(0) = secret[i], and record f(x) for each share's x-coordinate.
  for (let i = 0; i < secret.length; i++) {
    const poly = new Uint8Array(threshold);
    poly[0] = secret[i]; // constant term = secret byte
    const coeffs = randomBytes(threshold - 1);
    for (let d = 1; d < threshold; d++) poly[d] = coeffs[d - 1];

    for (let s = 0; s < totalShares; s++) {
      shares[s][i + 1] = evalPoly(poly, s + 1);
    }
  }

  return shares;
}

/**
 * Reconstruct the secret from exactly `threshold` (or more) shares.
 * All shares must have been produced by the same `splitSecret` call.
 */
export function combineShares(shareList: Uint8Array[]): Uint8Array {
  if (shareList.length < 2) throw new Error('At least 2 shares are required');
  const secretLen = shareList[0].length - 1;
  if (secretLen <= 0)       throw new Error('Shares are too short to contain a secret');

  const xs = new Uint8Array(shareList.map(s => s[0]));
  const secret = new Uint8Array(secretLen);

  for (let i = 0; i < secretLen; i++) {
    const ys = new Uint8Array(shareList.map(s => s[i + 1]));
    secret[i] = lagrangeAtZero(xs, ys);
  }

  return secret;
}

// ── Share file format ─────────────────────────────────────────────────────────

export interface RecoveryShareFile {
  v:           1;
  description: string;
  shareIndex:  number;   // 1-indexed x-coordinate
  totalShares: number;
  threshold:   number;
  share:       string;   // base64-encoded share bytes
  createdAt:   number;   // unix ms
}

export function encodeShareFile(
  shareBytes:  Uint8Array,
  shareIndex:  number,
  totalShares: number,
  threshold:   number,
): string {
  const file: RecoveryShareFile = {
    v:           1,
    description: `Khazna recovery share ${shareIndex} of ${totalShares} — keep this file safe. Any ${threshold} shares can reconstruct your vault key.`,
    shareIndex,
    totalShares,
    threshold,
    share:       bytesToBase64(shareBytes),
    createdAt:   Date.now(),
  };
  return JSON.stringify(file, null, 2);
}

export function decodeShareFile(json: string): Uint8Array {
  const file = JSON.parse(json) as RecoveryShareFile;
  if (file.v !== 1 || typeof file.share !== 'string') {
    throw new Error('Invalid recovery share file format');
  }
  return base64ToBytes(file.share);
}
