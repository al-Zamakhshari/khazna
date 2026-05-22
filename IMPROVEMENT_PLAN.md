# Khazna — Improvement Plan

*Prepared May 2026. Start a dedicated session and reference this file.*

---

## Context

Khazna is a browser-native PQC-encrypted vault with Nostr-based messaging.
Current evaluation score: **6.5 / 10** — solid cryptographic foundation,
operational and documentation gaps drag the score down. All gaps are fixable
without rewriting the crypto layer.

Target after this plan: **~8.5 / 10**

---

## Phase 1 — Quick Wins (1–2 hours each, no architectural change)

### 1. Gate CI on tests

**File:** `.github/workflows/deploy.yml`

Add before the build step:
```yaml
- name: Run tests
  run: npm test -- --run
```

The `--run` flag exits after one pass (Vitest's non-watch mode). Without this,
every push to main can ship broken code silently.

**Why it matters:** Already happened — tests exist and cover real scenarios, but
nothing enforces them before deployment. One-line fix, maximum impact.

---

### 2. Vault-loss warning at creation time

**File:** `src/components/VaultTab.tsx` (identity creation flow)

Add a mandatory acknowledgment modal before the vault is first written:

> *"Your vault is protected by a master password. If you forget this password,
> your vault — and all keys, contacts and messages inside it — is permanently
> unrecoverable. There is no reset option. Back up your vault file after
> creation."*

Require the user to type "I understand" or click a checkbox before proceeding.
This is not paternalism — it is the most common source of user support issues
for encrypted storage tools.

---

### 3. Session expiry warning

**File:** `src/hooks/useVault.ts`

The 30-day session TTL expires silently. Add:
- A banner in `App.tsx` when the session has < 3 days remaining: *"Your session
  key expires in N days — re-enter your password to renew."*
- Auto-renew if the user is active and the expiry is close.

The expiry timestamp is already in the vault; this is purely a display gap.

---

### 4. Unlock rate limiting

**File:** `src/hooks/useVault.ts`

Add an in-memory (not persisted) counter:
```ts
let failedAttempts = 0;
const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_DURATION_MS = 60_000; // 1 minute
```

After `LOCKOUT_THRESHOLD` consecutive failures, disable the unlock button for
`LOCKOUT_DURATION_MS`. Reset on successful unlock. PBKDF2 at 100K iterations
already makes brute-force slow, but this adds a UI layer that costs nothing.

---

### 5. Write a THREAT-MODEL.md

**New file:** `THREAT-MODEL.md` in the project root.

Sections:
- **What Khazna protects against**: passive network observer, someone who reads
  your localStorage after the fact, quantum-capable adversary in the future
- **What Khazna does NOT protect against**: malicious browser extensions,
  compromised Nostr relays serving stale prekeys, a compromised device at time
  of encryption, SW supply-chain attacks
- **Trust assumptions**: the @noble libraries, your browser's WebCrypto
  implementation, the Nostr relays you connect to

One page. Dramatically raises the credibility and perceived maturity of the
project. Forces you to think through the edge cases you haven't.

---

## Phase 2 — Security Improvements (half-day each)

### 6. Long-term identity key rotation

**The gap:** The core Khazna address (ML-KEM + X25519 keypair) never rotates.
If the private key is compromised, an attacker can decrypt all future messages
to that address indefinitely.

**Solution — versioned identity keys:**

Add a `keyVersion: number` field to identities. When a user wants to rotate:
1. Generate a new keypair
2. Publish a Nostr event (custom kind) announcing the new address with the old
   key signing the announcement (proof of ownership)
3. Keep the old private key in vault for decrypting historical messages
4. Old prekeys are invalidated on the relay

**Files to touch:** `src/utils/nostr.ts`, `src/components/VaultTab.tsx`,
`src/hooks/useVault.ts`

This is the single most important security feature missing from the current
design. Session keys and prekeys rotate but the root identity doesn't.

---

### 7. Relay key-freshness validation

**The gap:** If a Nostr relay returns stale or tampered prekeys, the sender
encrypts to the wrong key. There is no detection mechanism.

**Solution:**

When fetching prekeys from a relay, also fetch the published prekey commitment
(a signed list of hashes from the identity owner). Verify:
1. The returned prekey's hash matches the commitment
2. The commitment is signed by the identity's signing key
3. The commitment is not older than `MAX_PREKEY_AGE` (e.g., 90 days)

**Files to touch:** `src/utils/nostr.ts`, the prekey publishing flow in
`MessagesTab.tsx`.

This is the Nostr-equivalent of Certificate Transparency. Not trivial but
critical for the security model to hold end-to-end.

---

### 8. Subresource Integrity (SRI) for PWA assets

**The gap:** A compromised CDN or GitHub Pages can serve modified JavaScript.
Since all crypto runs client-side, this is a significant supply-chain risk.

**Solution:**

Vite can emit SRI hashes in the HTML `<script>` and `<link>` tags:
```js
// vite.config.ts
import { createHtmlPlugin } from 'vite-plugin-html'
// OR use vite's built-in: build.modulePreload.polyfill + hash injection
```

The Service Worker (`vite-plugin-pwa`) should also verify asset integrity via
the workbox `integrity` option.

**Files to touch:** `vite.config.ts`, `public/sw.js` (or the PWA plugin config
in `vite.config.ts`).

---

### 9. Vault backup integrity check

**The gap:** The manual backup/restore flow in `VaultTab.tsx` accepts any JSON
file without verifying its authenticity. A malicious backup file could overwrite
contacts with attacker-controlled public keys.

**Solution:**

When the vault is exported, sign the backup with the identity's signing key and
embed the signature in the JSON. On import, verify the signature before
accepting the backup. If no signing key exists (fresh install), warn the user
that the backup cannot be verified.

```ts
// export
const backup = JSON.stringify(vault);
const sig = await sign(backup, identity.sigPrivKey);
const signedBackup = { backup, sig, sigPubKey: identity.sigPubKey };

// import
const { backup, sig, sigPubKey } = JSON.parse(fileContent);
if (!verify(backup, sig, sigPubKey)) {
  throw new Error("Backup signature invalid — file may be tampered");
}
```

**Files to touch:** `src/components/VaultTab.tsx`, `src/utils/crypto.ts` (add
sign/verify helpers using the existing `@noble/curves` Schnorr implementation).

---

## Phase 3 — Code Quality & Coverage (half-day)

### 10. Increase test coverage to ≥ 80% on crypto.ts and nostr.ts

**Current state:**
- `crypto.ts` — 30 tests, good happy-path coverage, limited adversarial cases
- `nostr.ts` — 22 tests

**Missing cases to add:**
- `crypto.ts`:
  - Tampered ciphertext (flip bit in AES-GCM tag) → should throw
  - Bundle with correct length but wrong ML-KEM ct size
  - HKDF with boundary-length inputs (0-byte, max-byte secrets)
  - Vault decryption with wrong password → must throw
  - Multiple concurrent encrypt operations (parallelism safety)

- `nostr.ts`:
  - Relay returns prekey for a different identity (hash mismatch)
  - Gift-wrap with expired timestamp → should be rejected
  - Profile fetch with signature from wrong key

**File:** `test/crypto.test.ts`, `test/nostr.test.ts`

---

### 11. Add test coverage reporting to CI

**File:** `.github/workflows/deploy.yml`

```yaml
- name: Run tests with coverage
  run: npm test -- --run --coverage

- name: Upload coverage
  uses: codecov/codecov-action@v4
  with:
    files: ./coverage/coverage-final.json
```

Add `c8` or Vitest's built-in coverage:
```ts
// vitest.config.ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'json'],
  thresholds: { lines: 75, functions: 75, branches: 70 }
}
```

---

## Phase 4 — UX & Features (1–2 days)

### 12. Password recovery via secret sharing

**The gap:** Forgotten password = total vault loss, no recourse.

**Solution — optional Shamir-backed recovery:**

During vault creation, offer (opt-in):
1. Generate a 2-of-3 Shamir split of the vault encryption key
2. Export 3 recovery shares as downloadable files (or QR codes)
3. Any 2 shares reconstruct the vault key

The `@noble/hashes` package has the primitives. This can use the same GF(256)
arithmetic already implicit in the PQC operations.

**Important:** Make it opt-in and clearly explain the tradeoff (3 files that
could recover your vault if someone finds 2 of them).

**Files:** New `src/utils/recovery.ts`, `src/components/VaultTab.tsx` (new
"Recovery Setup" section).

---

### 13. Cross-tab synchronization

**The gap:** Opening Khazna in two tabs simultaneously leads to silent vault
overwrites when both tabs write.

**Solution:** Use `BroadcastChannel` or the `storage` event to detect vault
changes from other tabs and prompt the user:

```ts
window.addEventListener('storage', (e) => {
  if (e.key === VAULT_KEY && e.newValue !== e.oldValue) {
    // Another tab updated the vault — reload state
    showBanner("Vault updated in another tab — refreshing...");
    reloadVault();
  }
});
```

**File:** `src/hooks/useVault.ts`

---

### 14. Contact fingerprint verification

**The gap:** When you add a contact by Khazna address, you trust the address
is correct. There is no out-of-band verification ceremony.

**Solution:** Display the first 8 hex characters of `SHA256(kemPubKey)` as a
"safety number" (Signal-style). Both parties compare these over a trusted
channel (phone call, in person). If they match, the contact is verified.

Show a verification badge (✓) in the contacts list and messages for verified
contacts. Unverified contacts show a warning on first message.

**Files:** `src/components/MessagesTab.tsx`, `src/components/VaultTab.tsx`

---

### 15. Encrypted message deletion

**The gap:** Deleting a message from the UI doesn't delete it from Nostr relays
(relays have no deletion guarantee). This should be documented, not silently
ignored.

**Solution:**
- Send a NIP-09 delete event to the relay when the user deletes a message
- Add a disclaimer in the UI: "Message deletion requests are sent to relays but
  relays are not required to honor them. Assume deleted messages may still exist
  on some relays."

**Files:** `src/utils/nostr.ts`, `src/components/MessagesTab.tsx`

---

## Priority Order

| # | Task | Effort | Impact | Do first? |
|---|------|--------|--------|-----------|
| 1 | Gate CI on tests | 15 min | Critical | ✅ Yes |
| 2 | Vault-loss warning | 1 hr | High | ✅ Yes |
| 4 | Unlock rate limiting | 1 hr | Medium | ✅ Yes |
| 5 | THREAT-MODEL.md | 2 hr | High | ✅ Yes |
| 3 | Session expiry warning | 1 hr | Medium | Soon |
| 6 | Identity key rotation | 1 day | Critical (long-term) | Phase 2 |
| 7 | Relay key freshness | 1 day | High | Phase 2 |
| 9 | Backup integrity | 3 hr | High | Phase 2 |
| 10 | Test coverage to 80% | 3 hr | Medium | Phase 3 |
| 11 | Coverage in CI | 1 hr | Medium | Phase 3 |
| 8 | SRI for PWA assets | 3 hr | Medium | Phase 3 |
| 12 | Shamir recovery | 2 days | High | Phase 4 |
| 14 | Contact fingerprints | 1 day | High | Phase 4 |
| 13 | Cross-tab sync | 2 hr | Low-Medium | Phase 4 |
| 15 | NIP-09 delete events | 2 hr | Low | Phase 4 |

---

## What the score looks like after each phase

| After phase | Estimated score |
|---|---|
| Current | 6.5 / 10 |
| Phase 1 (quick wins) | 7.5 / 10 |
| Phase 2 (security) | 8.5 / 10 |
| Phase 3 (quality) | 8.8 / 10 |
| Phase 4 (features) | 9.0 / 10 |

The biggest single jump comes from Phase 2 — identity key rotation and relay
key freshness validation. These are the gaps that separate a "well-written demo"
from a "tool I'd trust for sensitive communications."

---

## Key files to know before starting

| File | What it does |
|---|---|
| `src/utils/crypto.ts` | All PQC + AES-GCM logic — the crypto kernel |
| `src/utils/nostr.ts` | NIP-17 gift wrap, prekey management, relay ops |
| `src/hooks/useVault.ts` | localStorage read/write with PBKDF2 encryption |
| `src/components/VaultTab.tsx` | Identity creation, backup/restore, contacts |
| `src/components/MessagesTab.tsx` | Nostr messaging UI (535 lines, largest file) |
| `.github/workflows/deploy.yml` | CI/CD — add test step here first |
| `vitest.config.ts` | Test runner config — add coverage thresholds here |
| `test/crypto.test.ts` | 30 tests — add adversarial cases here |
