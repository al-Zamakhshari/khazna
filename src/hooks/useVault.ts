import { useState, useEffect, useCallback } from 'react';
import {
  encryptVault, decryptVault, generateKeyPair, generateSessionKey, isSessionExpired,
  type KhaznaVault, type PQCKeyPair, type StoredPrekey,
  VAULT_KEY, bytesToBase64,
} from '../utils/crypto';
import { generateNostrKey, PREKEY_BATCH } from '../utils/nostr';
import { splitSecret, combineShares, encodeShareFile, decodeShareFile } from '../utils/recovery';
import { randomBytes } from '@noble/ciphers/utils.js';

// ── In-memory rate limiting (resets on page reload — intentional) ─────────────
const LOCKOUT_THRESHOLD  = 10;
const LOCKOUT_DURATION_MS = 60_000; // 1 minute
let _failedAttempts = 0;
let _lockoutUntil   = 0;

export function useVault() {
  const [vault,    setVault]          = useState<KhaznaVault | null>(null);
  const [isLocked, setIsLocked]       = useState(true);
  const [isNew,    setIsNew]          = useState(false);
  const [error,    setError]          = useState('');
  const [password, setMasterPassword] = useState('');
  // Unlock rate-limiting UI state
  const [lockoutUntil,   setLockoutUntil]   = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  // Cross-tab sync
  const [crossTabUpdate, setCrossTabUpdate] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(VAULT_KEY);
    if (!saved) { setIsNew(true); setIsLocked(false); }
  }, []);

  const save = useCallback(async (updated: KhaznaVault) => {
    if (!password) return;
    try {
      localStorage.setItem(VAULT_KEY, await encryptVault(updated, password));
      setVault(updated);
    } catch {
      setError('Failed to save changes.');
    }
  }, [password]);

  // ── Auth ─────────────────────────────────────────────────────────────────────

  const initialize = useCallback(async (pwd: string) => {
    try {
      const initial: KhaznaVault = { identities: [], contacts: [] };
      localStorage.setItem(VAULT_KEY, await encryptVault(initial, pwd));
      setVault(initial);
      setMasterPassword(pwd);
      setIsNew(false);
      setError('');
      return true;
    } catch {
      setError('Failed to initialize vault.');
      return false;
    }
  }, []);

  const unlock = useCallback(async (pwd: string) => {
    // Rate-limit check
    if (Date.now() < _lockoutUntil) {
      const secs = Math.ceil((_lockoutUntil - Date.now()) / 1000);
      setError(`Too many failed attempts. Try again in ${secs}s.`);
      return false;
    }

    const saved = localStorage.getItem(VAULT_KEY);
    if (!saved) return false;
    try {
      const decrypted = await decryptVault(saved, pwd);
      // Successful unlock — reset counters
      _failedAttempts = 0;
      _lockoutUntil   = 0;
      setFailedAttempts(0);
      setLockoutUntil(0);
      setVault(decrypted);
      setMasterPassword(pwd);
      setIsLocked(false);
      setError('');
      return true;
    } catch {
      _failedAttempts += 1;
      setFailedAttempts(_failedAttempts);
      if (_failedAttempts >= LOCKOUT_THRESHOLD) {
        _lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
        setLockoutUntil(_lockoutUntil);
        _failedAttempts = 0;
        setFailedAttempts(0);
        setError(`Too many failed attempts. Locked for ${LOCKOUT_DURATION_MS / 1000}s.`);
      } else {
        setError(`Invalid password. ${LOCKOUT_THRESHOLD - _failedAttempts} attempts remaining.`);
      }
      return false;
    }
  }, []);

  // ── Cross-tab vault sync ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== VAULT_KEY || e.newValue === null || e.newValue === e.oldValue) return;
      if (isLocked || !password) return;
      // Another tab updated the vault — silently re-decrypt with our password
      decryptVault(e.newValue, password)
        .then(updated => {
          setVault(updated);
          setCrossTabUpdate(true);
          setTimeout(() => setCrossTabUpdate(false), 4000);
        })
        .catch(() => {
          // Password mismatch means the other tab changed the master password
          setCrossTabUpdate(true);
        });
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [isLocked, password]);

  const lockVault = useCallback(() => {
    setVault(null);
    setMasterPassword('');
    setIsLocked(true);
  }, []);

  const reset = () => {
    localStorage.removeItem(VAULT_KEY);
    setVault(null);
    setMasterPassword('');
    setIsLocked(false);
    setIsNew(true);
  };

  // ── Identities ────────────────────────────────────────────────────────────────

  const addIdentity = useCallback((name: string) => {
    if (!vault) return null;
    const id   = crypto.randomUUID();
    const keys = generateKeyPair();
    save({ ...vault, identities: [...vault.identities, { id, name, keys }] });
    return { id, name, keys };
  }, [vault, save]);

  const removeItem = useCallback((id: string, type: 'identities' | 'contacts') => {
    if (!vault) return;
    save({ ...vault, [type]: vault[type].filter(item => item.id !== id) });
  }, [vault, save]);

  // Rotate an identity's keypair — old key is preserved in keyHistory for decrypting old messages.
  const rotateIdentityKey = useCallback(async (identityId: string): Promise<PQCKeyPair | null> => {
    if (!vault) return null;
    const identity = vault.identities.find(i => i.id === identityId);
    if (!identity) return null;
    const newKeys   = generateKeyPair();
    const newVersion = (identity.keyVersion ?? 1) + 1;
    const historyEntry = { keys: identity.keys, version: identity.keyVersion ?? 1, rotatedAt: Date.now() };
    const updatedIdentity = {
      ...identity,
      keys:       newKeys,
      keyVersion: newVersion,
      keyHistory: [...(identity.keyHistory ?? []), historyEntry],
    };
    await save({ ...vault, identities: vault.identities.map(i => i.id === identityId ? updatedIdentity : i) });
    return newKeys;
  }, [vault, save]);

  // ── Contacts ──────────────────────────────────────────────────────────────────

  const addContact = useCallback((
    name: string,
    publicKey: string,
    nostrPubkey?: string,
  ) => {
    if (!vault) return;
    save({
      ...vault,
      contacts: [...vault.contacts, { id: crypto.randomUUID(), name, publicKey, nostrPubkey, verified: false }],
    });
  }, [vault, save]);

  const verifyContact = useCallback(async (contactId: string) => {
    if (!vault) return;
    await save({
      ...vault,
      contacts: vault.contacts.map(c =>
        c.id === contactId ? { ...c, verified: true } : c
      ),
    });
  }, [vault, save]);

  const updateContactSession = useCallback(async (
    contactId: string,
    sessionPublicKey: string,
  ) => {
    if (!vault) return;
    await save({
      ...vault,
      contacts: vault.contacts.map(c =>
        c.id === contactId
          ? { ...c, sessionPublicKey, sessionFetchedAt: Date.now() }
          : c
      ),
    });
  }, [vault, save]);

  // ── Nostr identity ────────────────────────────────────────────────────────────

  const initNostr = useCallback(async () => {
    if (!vault || vault.nostrPrivateKey) return null;
    const nostrKey = generateNostrKey();
    await save({ ...vault, nostrPrivateKey: nostrKey.privateKey });
    return nostrKey;
  }, [vault, save]);

  // Atomic first-time setup: nostr key + session key + prekeys in one vault write.
  // Using separate sequential saves would cause stale-closure overwrites since React
  // batches state updates and each hook callback captures the vault at render time.
  const initMessaging = useCallback(async (count = PREKEY_BATCH) => {
    if (!vault || vault.nostrPrivateKey) return null;
    const nostrKey    = generateNostrKey();
    const session     = generateSessionKey();
    const prekeys: StoredPrekey[] = Array.from({ length: count }, () => ({
      id:   crypto.randomUUID(),
      keys: generateKeyPair(),
    }));
    await save({ ...vault, nostrPrivateKey: nostrKey.privateKey, sessionKey: session, prekeys });
    return { nostrKey, sessionKey: session.keys, prekeys };
  }, [vault, save]);

  // ── Session key (time-window forward secrecy) ─────────────────────────────────

  const ensureSessionKey = useCallback(async (): Promise<PQCKeyPair | null> => {
    if (!vault) return null;
    if (vault.sessionKey && !isSessionExpired(vault.sessionKey)) {
      return vault.sessionKey.keys;
    }
    const session = generateSessionKey();
    await save({ ...vault, sessionKey: session });
    return session.keys;
  }, [vault, save]);

  const rotateSessionKey = useCallback(async (): Promise<PQCKeyPair | null> => {
    if (!vault) return null;
    const session = generateSessionKey();
    await save({ ...vault, sessionKey: session });
    return session.keys;
  }, [vault, save]);

  // ── One-time prekeys (per-message forward secrecy) ────────────────────────────

  const generatePrekeys = useCallback(async (count = PREKEY_BATCH): Promise<StoredPrekey[]> => {
    if (!vault) return [];
    const fresh: StoredPrekey[] = Array.from({ length: count }, () => ({
      id:   crypto.randomUUID(),
      keys: generateKeyPair(),
    }));
    await save({ ...vault, prekeys: [...(vault.prekeys ?? []), ...fresh] });
    return fresh;
  }, [vault, save]);

  const consumePrekey = useCallback(async (id: string) => {
    if (!vault?.prekeys) return;
    await save({ ...vault, prekeys: vault.prekeys.filter(p => p.id !== id) });
  }, [vault, save]);

  const getPrekeyPrivKey = useCallback((id: string): string | null => {
    return vault?.prekeys?.find(p => p.id === id)?.keys.privateKey ?? null;
  }, [vault]);

  const getPrekeyCount = useCallback((): number => {
    return vault?.prekeys?.length ?? 0;
  }, [vault]);

  // ── Shamir recovery ───────────────────────────────────────────────────────────

  /**
   * Generates a 32-byte random recovery key, splits it 2-of-3, stores
   * a separate localStorage copy of the vault encrypted with that key
   * (so it can be restored without the master password), and returns
   * the three share files as downloadable JSON strings.
   */
  const setupRecovery = useCallback(async (): Promise<string[] | null> => {
    if (!vault) return null;
    const recoveryKey    = randomBytes(32);
    const recoveryBlob   = await encryptVault(vault, bytesToBase64(recoveryKey));
    localStorage.setItem(`${VAULT_KEY}_recovery`, recoveryBlob);

    const shares = splitSecret(recoveryKey, 2, 3);
    return shares.map((s, i) => encodeShareFile(s, i + 1, 3, 2));
  }, [vault]);

  /**
   * Given two recovery share JSON strings, reconstructs the recovery key,
   * decrypts the recovery vault blob, and replaces the current vault in
   * localStorage (without needing the master password).
   * Returns true on success.
   */
  const restoreFromShares = useCallback(async (shareJsonA: string, shareJsonB: string): Promise<boolean> => {
    try {
      const shareA    = decodeShareFile(shareJsonA);
      const shareB    = decodeShareFile(shareJsonB);
      const recovered = combineShares([shareA, shareB]);
      const blob      = localStorage.getItem(`${VAULT_KEY}_recovery`);
      if (!blob) throw new Error('No recovery vault found in this browser.');
      // Verify it decrypts correctly, then store as main vault
      await decryptVault(blob, bytesToBase64(recovered)); // throws if wrong
      localStorage.setItem(VAULT_KEY, blob);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Session expiry helpers
  const sessionDaysLeft = vault?.sessionKey
    ? Math.max(0, Math.ceil((vault.sessionKey.expiry - Date.now()) / 86_400_000))
    : null;
  const isSessionExpiringSoon = sessionDaysLeft !== null && sessionDaysLeft < 3;
  const isLockedOut      = Date.now() < lockoutUntil;
  const lockoutSecondsLeft = isLockedOut ? Math.ceil((lockoutUntil - Date.now()) / 1000) : 0;

  return {
    vault,
    isLocked,
    isNew,
    error,
    unlock,
    initialize,
    addIdentity,
    addContact,
    verifyContact,
    removeItem,
    updateContactSession,
    initNostr,
    initMessaging,
    ensureSessionKey,
    rotateSessionKey,
    rotateIdentityKey,
    generatePrekeys,
    consumePrekey,
    getPrekeyPrivKey,
    getPrekeyCount,
    lock: lockVault,
    reset,
    setError,
    // Rate-limiting
    isLockedOut,
    lockoutSecondsLeft,
    failedAttempts,
    // Session state
    sessionDaysLeft,
    isSessionExpiringSoon,
    // Cross-tab sync
    crossTabUpdate,
    // Shamir recovery
    setupRecovery,
    restoreFromShares,
  };
}
