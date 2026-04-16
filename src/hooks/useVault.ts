import { useState, useEffect, useCallback } from 'react';
import { encryptVault, decryptVault, type KhaznaVault, generateKeyPair } from '../utils/crypto';

export function useVault() {
  const [vault, setVault] = useState<KhaznaVault | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState('');
  const [password, setMasterPassword] = useState('');

  const VAULT_KEY = 'khazna_v2_vault';

  useEffect(() => {
    const saved = localStorage.getItem(VAULT_KEY);
    if (!saved) {
      setIsNew(true);
      setIsLocked(false);
    }
  }, []);

  const initialize = useCallback(async (pwd: string) => {
    try {
      const initial: KhaznaVault = { identities: [], contacts: [] };
      const encrypted = await encryptVault(initial, pwd);
      localStorage.setItem(VAULT_KEY, encrypted);
      setVault(initial);
      setMasterPassword(pwd);
      setIsNew(false);
      setError('');
      return true;
    } catch (e) {
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
    } catch (e) {
      setError('Invalid password.');
      return false;
    }
  }, []);

  const save = useCallback(async (updated: KhaznaVault) => {
    if (!password) return;
    try {
      const encrypted = await encryptVault(updated, password);
      localStorage.setItem(VAULT_KEY, encrypted);
      setVault(updated);
    } catch (e) {
      setError('Failed to save changes.');
    }
  }, [password]);

  const addIdentity = useCallback((name: string) => {
    if (!vault) return;
    const newKeys = generateKeyPair();
    const updated = {
      ...vault,
      identities: [...vault.identities, { id: crypto.randomUUID(), name, keys: newKeys }]
    };
    save(updated);
    return newKeys;
  }, [vault, save]);

  const addContact = useCallback((name: string, publicKey: string) => {
    if (!vault) return;
    const updated = {
      ...vault,
      contacts: [...vault.contacts, { id: crypto.randomUUID(), name, publicKey }]
    };
    save(updated);
  }, [vault, save]);

  const removeItem = useCallback((id: string, type: 'identities' | 'contacts') => {
    if (!vault) return;
    const updated = {
      ...vault,
      [type]: vault[type].filter(item => item.id !== id)
    };
    save(updated);
  }, [vault, save]);

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
    lock: lockVault,
    reset,
    setError
  };
}
