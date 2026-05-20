import { useState, useEffect, useCallback } from 'react';
import {
  encryptVault, decryptVault, generateKeyPair, generateSessionKey, isSessionExpired,
  type KhaznaVault, type PQCKeyPair, type StoredPrekey,
  VAULT_KEY,
} from '../utils/crypto';
import { generateNostrKey, PREKEY_BATCH } from '../utils/nostr';

export function useVault() {
  const [vault,    setVault]          = useState<KhaznaVault | null>(null);
  const [isLocked, setIsLocked]       = useState(true);
  const [isNew,    setIsNew]          = useState(false);
  const [error,    setError]          = useState('');
  const [password, setMasterPassword] = useState('');

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
    const saved = localStorage.getItem(VAULT_KEY);
    if (!saved) return false;
    try {
      const decrypted = await decryptVault(saved, pwd);
      setVault(decrypted);
      setMasterPassword(pwd);
      setIsLocked(false);
      setError('');
      return true;
    } catch {
      setError('Invalid password.');
      return false;
    }
  }, []);

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

  // ── Contacts ──────────────────────────────────────────────────────────────────

  const addContact = useCallback((
    name: string,
    publicKey: string,
    nostrPubkey?: string,
  ) => {
    if (!vault) return;
    save({
      ...vault,
      contacts: [...vault.contacts, { id: crypto.randomUUID(), name, publicKey, nostrPubkey }],
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

  return {
    vault,
    isLocked,
    isNew,
    error,
    unlock,
    initialize,
    addIdentity,
    addContact,
    removeItem,
    updateContactSession,
    initNostr,
    initMessaging,
    ensureSessionKey,
    rotateSessionKey,
    generatePrekeys,
    consumePrekey,
    getPrekeyPrivKey,
    getPrekeyCount,
    lock: lockVault,
    reset,
    setError,
  };
}
