# Khazna — Threat Model

*Last updated: May 2026*

---

## What Khazna protects against

### Passive network observer
All message content is encrypted before it leaves your device. Nostr relays see only
NIP-17 gift-wrapped blobs — they cannot read message text, file contents, or sender/recipient
identities. The hybrid ML-KEM-768 + X25519 KEM means a future quantum computer cannot
retroactively decrypt captured traffic.

### Offline attacker with a copy of your localStorage
The vault is encrypted with AES-256-GCM using a key derived via PBKDF2-SHA-256 at 100 000
iterations. An attacker who extracts your localStorage data cannot read it without your master
password; brute-forcing a strong password is computationally infeasible with this KDF.

### Quantum-capable adversary in the future
The ML-KEM-768 (CRYSTALS-Kyber) component is a NIST-selected post-quantum algorithm. Even if
large-scale quantum computers become available, an adversary who collected your ciphertext today
cannot decrypt it later with Shor's algorithm (which only breaks elliptic-curve and RSA). The
X25519 layer adds classical security until PQC library audits mature.

### Message tampering in transit
Every Khazna payload carries a Schnorr signature over `SHA-256(ciphertext)` made with the
sender's Nostr key. Recipients verify this before decryption. A relay that modifies ciphertext
bytes will cause verification to fail and the message will be silently dropped.

---

## What Khazna does NOT protect against

### Malicious or compromised browser extensions
A browser extension with `"host_permissions": ["*"]` can read `localStorage`, intercept
clipboard operations, or inject script into the page. Khazna has no defence against this.
Use a browser profile with no extensions for sensitive operations.

### Compromised Nostr relays serving stale or substituted prekeys
If a relay returns a different user's prekeys (or replays old ones), you will encrypt to the
wrong key and your message will be unreadable by the intended recipient — but also potentially
readable by someone else. Khazna validates prekey signatures, but relies on relays not
censoring the latest event. See the relay key-freshness feature for the current mitigation.

### A compromised device at the time of encryption
If malware or spyware is running on your machine when you type a message or unlock the vault,
Khazna cannot help. This is a universal limitation of client-side browser applications.

### Service-worker supply-chain attacks
Khazna is a PWA served from GitHub Pages. A compromised CDN, GitHub Pages outage, or
malicious GitHub Pages deployment could serve modified JavaScript. Subresource Integrity (SRI)
hashes are emitted in the HTML to mitigate this, but only if the browser honours them. If you
require the highest assurance, run Khazna from a local build.

### Long-term identity key compromise
The root ML-KEM + X25519 identity keypair currently does not rotate automatically. A leaked
private key allows decryption of all future messages encrypted to that identity until the user
manually rotates via Vault → Identity → Rotate Key. Use the key rotation feature if you suspect
your long-term key has been exposed.

### Vault loss due to forgotten password
There is no server-side backup and no password reset. A forgotten master password means
permanent data loss. Use the optional Shamir recovery feature (Vault → Backup &amp; Restore →
Recovery Setup) to create 2-of-3 recovery shares.

---

## Trust assumptions

| Dependency | What you're trusting |
|---|---|
| `@noble/post-quantum` (ml-kem768) | Correct implementation of NIST FIPS 203; no hidden weaknesses |
| `@noble/ciphers` (AES-GCM) | Correct AES-256-GCM; secure nonce generation via `crypto.getRandomValues` |
| `@noble/curves` (X25519, Schnorr) | Correct implementation of RFC 7748 and BIP-340 |
| `@noble/hashes` (SHA-256, PBKDF2, HKDF) | Correct digest and KDF implementations |
| `nostr-tools` (NIP-17, NIP-19) | Correct gift-wrap implementation; no leakage of sender identity in relay queries |
| Your browser's `WebCrypto` API | `crypto.getRandomValues` is truly random; the browser's TLS stack is intact |
| Nostr relays | They deliver your messages (liveness only — confidentiality is not assumed) |
| GitHub Pages | Serves the correct, unmodified application build (mitigated by SRI) |

---

## Design decisions and their rationale

**Why PBKDF2 instead of Argon2?**
WebCrypto has built-in PBKDF2 support (no external library). Argon2 with memory hardness is
stronger in theory but requires shipping a large WASM binary and increases the attack surface.
100 000 iterations of PBKDF2-SHA-256 provides adequate resistance to offline attacks with
modern hardware; this may be revisited as hardware improves.

**Why localStorage instead of IndexedDB?**
Synchronous reads simplify the vault unlock path. Both have equivalent Same-Origin Policy
protections in browsers. For a future native-app wrapper (Capacitor, Tauri), the storage
backend should be replaced with OS-native encrypted storage.

**Why Nostr for routing?**
Nostr is a decentralised, censorship-resistant relay network with no central authority that can
be coerced into providing metadata. Message routing metadata (sender/recipient Nostr pubkeys) is
concealed inside NIP-17 gift-wraps, which themselves are encrypted to the recipient.

---

*This document describes the threat model as of the current release. It will be updated as new
features are added or new threats are identified.*
