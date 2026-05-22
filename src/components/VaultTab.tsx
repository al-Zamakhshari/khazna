import React, { useState } from 'react';
import { type PQCKeyPair, type VaultIdentity, VAULT_KEY, contactFingerprint } from '../utils/crypto';
import {
  Lock, Unlock, Shield, User, Users, Plus, Trash2, Eye,
  FolderPlus, QrCode, Copy, Download, PlusCircle, Check, RefreshCw,
  Upload, FileJson, Sparkles, X, AlertTriangle, RotateCcw, ShieldCheck,
} from 'lucide-react';
import { useVault } from '../hooks/useVault';
import { QRCodeSVG } from 'qrcode.react';
import { signBundle, verifyBundle } from '../utils/nostr';
import { getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from '@noble/hashes/utils.js';

interface VaultTabProps {
  manager: ReturnType<typeof useVault>;
  activeIdentity: { name: string; keys: PQCKeyPair } | null;
  onIdentitySelect: (id: { name: string; keys: PQCKeyPair }) => void;
  onContactSelect: (publicKey: string) => void;
}

export const VaultTab: React.FC<VaultTabProps> = ({
  manager, activeIdentity, onIdentitySelect, onContactSelect,
}) => {
  const [pwdInput, setPwdInput] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showVaultWarning, setShowVaultWarning] = useState(false);
  const [vaultWarningAck,  setVaultWarningAck]  = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'identities' | 'contacts' | 'settings'>('identities');
  const [restoreError,    setRestoreError]    = useState('');
  const [recoveryShares,  setRecoveryShares]  = useState<string[] | null>(null);
  const [recoverySetupOn, setRecoverySetupOn] = useState(false);
  const [shareFileA,      setShareFileA]      = useState('');
  const [shareFileB,      setShareFileB]      = useState('');
  const [recoveryStatus,  setRecoveryStatus]  = useState<'idle' | 'ok' | 'err'>('idle');
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [isCreating,     setIsCreating]     = useState(false);
  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null);
  const [copiedId,       setCopiedId]       = useState<string | null>(null);
  const [keyModal,       setKeyModal]       = useState<VaultIdentity | null>(null);
  const [qrModal,        setQrModal]        = useState<VaultIdentity | null>(null);

  const { vault, isLocked, isNew, error, unlock, initialize, addIdentity, addContact, verifyContact, removeItem, reset,
          isLockedOut, lockoutSecondsLeft, rotateIdentityKey, setupRecovery, restoreFromShares } = manager;

  const handleCreateIdentity = () => {
    if (!newName.trim()) return;
    const created = addIdentity(newName.trim());
    if (created) {
      setNewlyCreatedId(created.id);
      setKeyModal(created); // open key modal so user can immediately copy their address
    }
    setNewName('');
    setIsCreating(false);
  };

  const copyAddress = (id: string, publicKey: string) => {
    navigator.clipboard.writeText(publicKey);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const downloadKey = (text: string, filename: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = filename;
    a.click();
  };

  const handleBackup = () => {
    const data = localStorage.getItem(VAULT_KEY);
    if (!data) return;

    let content: string;
    if (manager.vault?.nostrPrivateKey) {
      // Signed backup: proves the backup came from this identity's owner
      const privKey = manager.vault.nostrPrivateKey;
      const pubKey  = getPublicKey(hexToBytes(privKey));
      const sig     = signBundle(data, privKey);
      content = JSON.stringify({ v: 1, backup: data, sig, sigPubKey: pubKey }, null, 2);
    } else {
      // No Nostr key yet — export raw, warn user
      content = data;
    }

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    a.download = `khazna-vault-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      try {
        const parsed = JSON.parse(content);
        if (parsed.v === 1 && typeof parsed.backup === 'string' && parsed.sig && parsed.sigPubKey) {
          // Signed backup — verify before accepting
          if (!verifyBundle(parsed.backup, parsed.sig, parsed.sigPubKey)) {
            setRestoreError('Backup signature is invalid — the file may have been tampered with. Import aborted.');
            return;
          }
          localStorage.setItem(VAULT_KEY, parsed.backup);
        } else if (typeof parsed === 'object') {
          // Unknown JSON format
          setRestoreError('Unrecognised backup format. Expected a signed Khazna backup file.');
          return;
        }
      } catch {
        // Not JSON — assume legacy raw base64 blob (backups exported before signing was added)
        localStorage.setItem(VAULT_KEY, content);
      }
      window.location.reload();
    };
    reader.readAsText(file);
  };

  // ── New vault setup ──────────────────────────────────────────────────────
  if (isNew) {
    return (
      <div className="space-y-6">
        <div className="alert alert-info">
          <FolderPlus size={20} />
          <div>
            <strong>Create Your Vault</strong>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              Set a Master Password to encrypt your keys and contacts in this browser.
              You'll need it every time you open Khazna.
            </p>
          </div>
        </div>
        <input
          type="password"
          placeholder="Master Password"
          value={pwdInput}
          onChange={e => setPwdInput(e.target.value)}
          autoFocus
        />
        <input
          type="password"
          placeholder="Confirm Password"
          value={confirmPwd}
          onChange={e => setConfirmPwd(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && pwdInput === confirmPwd && initialize(pwdInput)}
        />
        {error && <div className="alert alert-error">{error}</div>}
        <button
          className="btn"
          onClick={() => { if (pwdInput && pwdInput === confirmPwd) setShowVaultWarning(true); }}
          disabled={!pwdInput || pwdInput !== confirmPwd}
        >
          Create Vault
        </button>
        <div style={{ marginTop: '1rem', padding: '1.25rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>
          <label style={{ marginBottom: '0.75rem', display: 'block', gap: '6px' }}>
            <Upload size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
            Restore from a backup file instead
          </label>
          <input type="file" accept=".json" onChange={handleRestore} />
        </div>

        {/* Vault-loss acknowledgment modal */}
        {showVaultWarning && (
          <div className="modal-overlay" onClick={() => setShowVaultWarning(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
              <button className="modal-close" onClick={() => setShowVaultWarning(false)} aria-label="Close"><X size={15} /></button>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={18} color="var(--error)" style={{ flexShrink: 0 }} /> Important — read before continuing
              </h3>
              <div style={{ fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.25rem', color: 'var(--text)' }}>
                <p style={{ margin: '0 0 0.75rem' }}>
                  Your vault is protected by your master password. <strong>If you forget this password, your vault — and all keys, contacts and messages inside it — is permanently unrecoverable.</strong>
                </p>
                <p style={{ margin: '0 0 0.75rem' }}>
                  There is no reset option, no recovery email, and no way for anyone to help you.
                </p>
                <p style={{ margin: 0 }}>
                  Back up your vault file after creation (Vault → Backup &amp; Restore).
                </p>
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '0.875rem', marginBottom: '1.25rem', width: '100%', boxSizing: 'border-box' }}>
                <input
                  type="checkbox"
                  checked={vaultWarningAck}
                  onChange={e => setVaultWarningAck(e.target.checked)}
                  style={{ marginTop: '3px', flexShrink: 0, width: '15px', height: '15px' }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  I understand my password cannot be recovered. I will keep it safe and back up my vault file.
                </span>
              </label>
              <button
                className="btn"
                disabled={!vaultWarningAck}
                onClick={() => { setShowVaultWarning(false); initialize(pwdInput); }}
              >
                Create Vault
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Locked vault ─────────────────────────────────────────────────────────
  if (isLocked) {
    return (
      <div className="space-y-6">
        <div className="alert alert-info">
          <Lock size={20} />
          <span>Enter your Master Password to unlock the vault.</span>
        </div>
        <input
          type="password"
          placeholder="Master Password"
          value={pwdInput}
          onChange={e => setPwdInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !isLockedOut && unlock(pwdInput)}
          autoFocus
          disabled={isLockedOut}
        />
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn" onClick={() => unlock(pwdInput)} disabled={!pwdInput || isLockedOut}>
          <Unlock size={18} style={{ marginRight: '8px' }} />
          {isLockedOut ? `Locked — wait ${lockoutSecondsLeft}s` : 'Unlock Vault'}
        </button>
        <button
          className="btn"
          style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          onClick={() => {
            if (confirm('Reset vault? This will permanently delete ALL your keys in this browser.')) reset();
          }}
        >
          <RefreshCw size={15} style={{ marginRight: '8px' }} /> Reset & Wipe Everything
        </button>
      </div>
    );
  }

  // ── Unlocked vault ───────────────────────────────────────────────────────
  return (
    <>
    <div className="space-y-8">
      <div className="tabs">
        <button
          className={`tab-btn ${activeSubTab === 'identities' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('identities')}
        >
          <User size={15} /> My Identities
        </button>
        <button
          className={`tab-btn ${activeSubTab === 'contacts' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('contacts')}
        >
          <Users size={15} /> Contacts
        </button>
        <button
          className={`tab-btn ${activeSubTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('settings')}
        >
          Backup & Restore
        </button>
      </div>

      {/* ── Identities ── */}
      {activeSubTab === 'identities' && (
        <div className="space-y-4">
          {/* Create form */}
          {isCreating ? (
            <div className="card" style={{ padding: '1.25rem', borderColor: 'var(--primary)' }}>
              <label>Identity Nickname</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  placeholder="e.g. Work, Personal"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateIdentity()}
                  autoFocus
                />
                <button
                  className="btn"
                  style={{ width: 'auto' }}
                  onClick={handleCreateIdentity}
                  disabled={!newName.trim()}
                >
                  <Check size={18} />
                </button>
                <button
                  className="btn"
                  style={{ width: 'auto', background: 'var(--text-muted)' }}
                  onClick={() => { setIsCreating(false); setNewName(''); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn"
              style={{ background: 'transparent', border: '2px dashed var(--border)', color: 'var(--text-muted)' }}
              onClick={() => setIsCreating(true)}
            >
              <PlusCircle size={17} style={{ marginRight: '8px' }} /> Add New Identity
            </button>
          )}

          {/* Empty state */}
          {vault?.identities.length === 0 && !isCreating && (
            <div className="onboarding-steps">
              <p className="onboarding-title">Get started in 3 steps</p>
              <div className="onboarding-step">
                <div className="step-num">1</div>
                <div>
                  <strong>Create an identity</strong>
                  <p>Tap "Add New Identity" to generate your Public Address and Private Key pair.</p>
                </div>
              </div>
              <div className="onboarding-step">
                <div className="step-num">2</div>
                <div>
                  <strong>Share your Public Address</strong>
                  <p>Anyone who wants to send you an encrypted message needs this address.</p>
                </div>
              </div>
              <div className="onboarding-step">
                <div className="step-num">3</div>
                <div>
                  <strong>Decrypt messages sent to you</strong>
                  <p>Select this identity, then go to the Decrypt tab to unlock anything sent to you.</p>
                </div>
              </div>
            </div>
          )}

          {/* Identity list */}
          {vault?.identities.map(id => {
            const isActive = activeIdentity?.keys.publicKey === id.keys.publicKey;
            const isNew = newlyCreatedId === id.id;

            return (
              <div
                key={id.id}
                className="result-area"
                style={{ marginTop: 0, border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)' }}
              >
                {/* Post-creation callout */}
                {isNew && (
                  <div className="new-identity-callout">
                    <Sparkles size={14} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      Identity created! Copy your <strong>Public Address</strong> below and share it with anyone who wants to send you encrypted messages.
                    </span>
                    <button
                      style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1, padding: 0 }}
                      onClick={() => setNewlyCreatedId(null)}
                    >×</button>
                  </div>
                )}

                <div className="result-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Shield size={17} color={isActive ? 'var(--primary)' : 'var(--text-muted)'} />
                    <strong>{id.name}</strong>
                    {isActive && (
                      <span className="alert-success" style={{ padding: '2px 8px', fontSize: '0.6rem', borderRadius: '4px' }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="copy-btn" onClick={() => onIdentitySelect(id)} disabled={isActive}>
                      {isActive ? 'Active' : 'Select'}
                    </button>
                    <button className="copy-btn" title="Show QR code" onClick={() => setQrModal(id)}>
                      <QrCode size={14} />
                    </button>
                    <button className="copy-btn" title="Show keys" onClick={() => setKeyModal(id)}>
                      <Eye size={14} />
                    </button>
                    <button
                      className="copy-btn"
                      title={`Rotate keypair (v${id.keyVersion ?? 1})`}
                      onClick={async () => {
                        if (confirm(`Rotate the keypair for "${id.name}"?\n\nThis generates a new public key. Contacts will need to re-fetch your profile before they can send new messages to you.\n\nOld keys are kept to decrypt historical messages.`)) {
                          await rotateIdentityKey(id.id);
                        }
                      }}
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button
                      className="copy-btn"
                      style={{ color: 'var(--error)' }}
                      onClick={() => {
                        if (confirm(`Delete identity "${id.name}"? This cannot be undone.`)) {
                          removeItem(id.id, 'identities');
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Contacts ── */}
      {activeSubTab === 'contacts' && (
        <div className="space-y-4">
          <div className="card" style={{ padding: '1.25rem', borderStyle: 'dashed', background: 'transparent' }}>
            <label>Save a Contact</label>
            <input
              placeholder="Contact name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              style={{ marginBottom: '0.5rem' }}
            />
            <textarea
              placeholder="Paste their Public Address"
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              style={{ height: '80px', marginBottom: '0.5rem' }}
            />
            <button
              className="btn"
              onClick={() => { addContact(newName, newKey); setNewName(''); setNewKey(''); }}
              disabled={!newName || !newKey}
            >
              <Plus size={16} style={{ marginRight: '6px' }} /> Save Contact
            </button>
          </div>

          {vault?.contacts.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
              <Users size={40} style={{ opacity: 0.15, marginBottom: '0.75rem' }} />
              <p style={{ margin: 0, fontSize: '0.875rem' }}>No contacts yet. Save someone's Public Address to quickly encrypt messages to them.</p>
            </div>
          )}

          {vault?.contacts.map(c => {
            const fp = c.publicKey ? contactFingerprint(c.publicKey) : null;
            return (
              <div key={c.id} className="result-area" style={{ marginTop: 0 }}>
                <div className="result-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {c.verified
                      ? <span title="Fingerprint verified"><ShieldCheck size={17} color="var(--success)" /></span>
                      : <User size={17} />}
                    <strong>{c.name}</strong>
                    {fp && (
                      <span
                        title={`Safety number: ${fp} — compare with your contact over a trusted channel`}
                        style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}
                      >
                        {fp}
                      </span>
                    )}
                    {!c.verified && (
                      <span style={{ fontSize: '0.65rem', color: '#f59e0b' }}>unverified</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="copy-btn" onClick={() => onContactSelect(c.publicKey)}>
                      Encrypt To
                    </button>
                    {!c.verified && (
                      <button
                        className="copy-btn"
                        title="Mark fingerprint as verified after comparing out-of-band"
                        onClick={() => verifyContact(c.id)}
                        style={{ color: 'var(--success)' }}
                      >
                        <Check size={14} />
                      </button>
                    )}
                    <button
                      className="copy-btn"
                      style={{ color: 'var(--error)' }}
                      onClick={() => removeItem(c.id, 'contacts')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Backup & Restore ── */}
      {activeSubTab === 'settings' && (
        <div className="space-y-6">
          {!vault?.nostrPrivateKey && (
            <div className="alert alert-info" style={{ fontSize: '0.8rem' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              Set up messaging first to enable signed backups. Backups without a signature cannot be tamper-verified on restore.
            </div>
          )}
          {restoreError && (
            <div className="alert alert-error" style={{ fontSize: '0.8rem' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              {restoreError}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <FileJson size={22} style={{ margin: '0 auto 0.75rem', color: 'var(--text-muted)' }} />
              <h4 style={{ margin: '0 0 0.5rem' }}>Export Vault</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                Download your encrypted vault as a{vault?.nostrPrivateKey ? ' cryptographically signed' : ''} JSON backup.
              </p>
              <button className="copy-btn" style={{ margin: '0 auto' }} onClick={handleBackup}>
                <Download size={14} /> Download .json
              </button>
            </div>

            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', borderStyle: 'dashed' }}>
              <Upload size={22} style={{ margin: '0 auto 0.75rem', color: 'var(--text-muted)' }} />
              <h4 style={{ margin: '0 0 0.5rem' }}>Import Vault</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                Restore a vault backup on this device. Signed backups are verified before import.
              </p>
              <input
                type="file"
                accept=".json"
                onChange={handleRestore}
                style={{ display: 'none' }}
                id="restore-upload"
              />
              <button
                className="copy-btn"
                style={{ margin: '0 auto' }}
                onClick={() => { setRestoreError(''); document.getElementById('restore-upload')?.click(); }}
              >
                Select File
              </button>
            </div>
          </div>
          {/* ── Recovery setup (Shamir 2-of-3) ── */}
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={16} /> Recovery Setup (2-of-3 Shamir Shares)
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem', lineHeight: 1.5 }}>
              Optional: generate 3 recovery shares. Any 2 of them can restore your vault — even if you forget your master password. Store shares in separate, secure locations.
            </p>

            {!recoverySetupOn ? (
              <button className="copy-btn" onClick={() => setRecoverySetupOn(true)}>
                <PlusCircle size={13} /> Set Up Recovery Shares
              </button>
            ) : (
              <div className="card" style={{ padding: '1.25rem', borderColor: 'var(--primary)' }}>
                {!recoveryShares ? (
                  <>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                      This generates 3 share files. Download and store each in a different safe location (e.g., USB drive, password manager, trusted friend).
                      Any 2 shares together can unlock your vault.
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn" style={{ flex: 1 }} onClick={async () => {
                        const shares = await setupRecovery?.();
                        if (shares) setRecoveryShares(shares);
                      }}>
                        Generate Shares
                      </button>
                      <button className="btn" style={{ flex: 1, background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                        onClick={() => setRecoverySetupOn(false)}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: '0.8rem', color: 'var(--success)', marginBottom: '1rem' }}>
                      3 recovery shares generated. Download each file and store separately. The shares only work together — one share alone reveals nothing.
                    </p>
                    {recoveryShares.map((json, i) => (
                      <button key={i} className="copy-btn" style={{ marginBottom: '0.5rem', width: '100%', justifyContent: 'flex-start' }}
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
                          a.download = `khazna-recovery-share-${i + 1}-of-3.json`;
                          a.click();
                        }}>
                        <Download size={13} /> Download Share {i + 1} of 3
                      </button>
                    ))}
                    <button className="copy-btn" style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}
                      onClick={() => { setRecoveryShares(null); setRecoverySetupOn(false); }}>
                      Done
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Restore from shares (on a fresh install with the recovery blob in localStorage) */}
            <div style={{ marginTop: '1rem' }}>
              <details>
                <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Restore using 2 recovery share files…
                </summary>
                <div style={{ marginTop: '0.75rem' }}>
                  {['A', 'B'].map((label, i) => (
                    <div key={label} style={{ marginBottom: '0.5rem' }}>
                      <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>Share {label}</label>
                      <input
                        type="file"
                        accept=".json"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const r = new FileReader();
                          r.onload = ev => i === 0
                            ? setShareFileA(ev.target?.result as string)
                            : setShareFileB(ev.target?.result as string);
                          r.readAsText(f);
                        }}
                      />
                    </div>
                  ))}
                  {recoveryStatus === 'ok'  && <p style={{ color: 'var(--success)', fontSize: '0.8rem' }}>Vault restored — reload to unlock with your password.</p>}
                  {recoveryStatus === 'err' && <p style={{ color: 'var(--error)', fontSize: '0.8rem' }}>Recovery failed. Check that both share files are valid and from the same backup.</p>}
                  <button
                    className="btn"
                    disabled={!shareFileA || !shareFileB}
                    onClick={async () => {
                      const ok = await restoreFromShares?.(shareFileA, shareFileB);
                      setRecoveryStatus(ok ? 'ok' : 'err');
                    }}
                  >
                    Restore from Shares
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* ── Key modal ── */}
    {keyModal && (
      <div className="modal-overlay" onClick={() => setKeyModal(null)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <button className="modal-close" onClick={() => setKeyModal(null)} aria-label="Close"><X size={15} /></button>
          <h3 style={{ margin: '0 0 1.5rem', fontSize: '1rem' }}>{keyModal.name} — Keys</h3>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>
              Public Address — share freely
            </label>
            <div className="key-display" style={{ fontSize: '0.65rem', marginBottom: '0.5rem' }}>{keyModal.keys.publicKey}</div>
            <button className="copy-btn" onClick={() => copyAddress(keyModal.id, keyModal.keys.publicKey)}>
              {copiedId === keyModal.id ? <Check size={12} /> : <Copy size={12} />}
              {copiedId === keyModal.id ? 'Copied!' : 'Copy Address'}
            </button>
          </div>

          <div>
            <label style={{ fontSize: '0.7rem', color: 'var(--error)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>
              Private Key — keep this secret
            </label>
            <div className="key-display" style={{ fontSize: '0.65rem', background: 'rgba(239,68,68,0.05)', marginBottom: '0.5rem' }}>{keyModal.keys.privateKey}</div>
            <button className="copy-btn" onClick={() => downloadKey(keyModal.keys.privateKey, `${keyModal.name}-private-key.txt`)}>
              <Download size={12} /> Download Private Key
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── QR modal ── */}
    {qrModal && (
      <div className="modal-overlay" onClick={() => setQrModal(null)}>
        <div className="modal" style={{ maxWidth: '320px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <button className="modal-close" onClick={() => setQrModal(null)} aria-label="Close"><X size={15} /></button>
          <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>{qrModal.name}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
            Public Address — let others scan to encrypt to you
          </p>
          <div style={{ background: 'white', padding: '16px', borderRadius: '12px', display: 'inline-block', marginBottom: '1.25rem' }}>
            <QRCodeSVG value={qrModal.keys.publicKey} size={220} />
          </div>
          <br />
          <button className="copy-btn" style={{ margin: '0 auto' }} onClick={() => copyAddress(qrModal.id, qrModal.keys.publicKey)}>
            {copiedId === qrModal.id ? <Check size={12} /> : <Copy size={12} />}
            {copiedId === qrModal.id ? 'Copied!' : 'Copy Address'}
          </button>
        </div>
      </div>
    )}
  </>
  );
};
