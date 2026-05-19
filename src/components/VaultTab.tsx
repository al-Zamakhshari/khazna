import React, { useState } from 'react';
import { type PQCKeyPair, VAULT_KEY } from '../utils/crypto';
import {
  Lock, Unlock, Shield, User, Users, Plus, Trash2, Eye, EyeOff,
  FolderPlus, QrCode, Copy, Download, PlusCircle, Check, RefreshCw,
  Upload, FileJson, Sparkles,
} from 'lucide-react';
import { useVault } from '../hooks/useVault';
import { QRCodeSVG } from 'qrcode.react';

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
  const [activeSubTab, setActiveSubTab] = useState<'identities' | 'contacts' | 'settings'>('identities');
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [showKeysMap, setShowKeysMap] = useState<Record<string, boolean>>({});
  const [showQRMap, setShowQRMap] = useState<Record<string, boolean>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { vault, isLocked, isNew, error, unlock, initialize, addIdentity, addContact, removeItem, reset } = manager;

  const handleCreateIdentity = () => {
    if (!newName.trim()) return;
    const created = addIdentity(newName.trim());
    if (created) {
      setNewlyCreatedId(created.id);
      setShowKeysMap(p => ({ ...p, [created.id]: true }));
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = `khazna-vault-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      localStorage.setItem(VAULT_KEY, ev.target?.result as string);
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
          onClick={() => initialize(pwdInput)}
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
          onKeyDown={e => e.key === 'Enter' && unlock(pwdInput)}
          autoFocus
        />
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn" onClick={() => unlock(pwdInput)} disabled={!pwdInput}>
          <Unlock size={18} style={{ marginRight: '8px' }} /> Unlock Vault
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
                    <Sparkles size={14} />
                    Identity created! Copy your <strong>Public Address</strong> below and share it with anyone who wants to send you encrypted messages.
                    <button
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1 }}
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
                    <button className="copy-btn" onClick={() => setShowQRMap(p => ({ ...p, [id.id]: !p[id.id] }))}>
                      <QrCode size={14} />
                    </button>
                    <button className="copy-btn" onClick={() => setShowKeysMap(p => ({ ...p, [id.id]: !p[id.id] }))}>
                      {showKeysMap[id.id] ? <EyeOff size={14} /> : <Eye size={14} />}
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

                {showQRMap[id.id] && (
                  <div className="qr-container">
                    <QRCodeSVG value={id.keys.publicKey} size={180} />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                      Scan to share your Public Address
                    </p>
                  </div>
                )}

                {showKeysMap[id.id] && (
                  <div className="space-y-4" style={{ marginTop: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Public Address</label>
                      <div className="key-display" style={{ fontSize: '0.65rem' }}>{id.keys.publicKey}</div>
                      <button
                        className="copy-btn"
                        style={{ marginTop: '0.5rem' }}
                        onClick={() => copyAddress(id.id, id.keys.publicKey)}
                      >
                        {copiedId === id.id ? <Check size={12} /> : <Copy size={12} />}
                        {copiedId === id.id ? 'Copied!' : 'Copy Address'}
                      </button>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--error)' }}>
                        Private Key — keep this secret
                      </label>
                      <div className="key-display" style={{ fontSize: '0.65rem', background: 'rgba(239,68,68,0.05)' }}>
                        {id.keys.privateKey}
                      </div>
                      <button
                        className="copy-btn"
                        style={{ marginTop: '0.5rem' }}
                        onClick={() => downloadKey(id.keys.privateKey, `${id.name}-private-key.txt`)}
                      >
                        <Download size={12} /> Download Private Key
                      </button>
                    </div>
                  </div>
                )}
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

          {vault?.contacts.map(c => (
            <div key={c.id} className="result-area" style={{ marginTop: 0 }}>
              <div className="result-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <User size={17} />
                  <strong>{c.name}</strong>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="copy-btn" onClick={() => onContactSelect(c.publicKey)}>
                    Encrypt To
                  </button>
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
          ))}
        </div>
      )}

      {/* ── Backup & Restore ── */}
      {activeSubTab === 'settings' && (
        <div className="space-y-6">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <FileJson size={22} style={{ margin: '0 auto 0.75rem', color: 'var(--text-muted)' }} />
              <h4 style={{ margin: '0 0 0.5rem' }}>Export Vault</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                Download your encrypted vault as a JSON file to back it up.
              </p>
              <button className="copy-btn" style={{ margin: '0 auto' }} onClick={handleBackup}>
                <Download size={14} /> Download .json
              </button>
            </div>

            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', borderStyle: 'dashed' }}>
              <Upload size={22} style={{ margin: '0 auto 0.75rem', color: 'var(--text-muted)' }} />
              <h4 style={{ margin: '0 0 0.5rem' }}>Import Vault</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                Restore a vault backup on this device.
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
                onClick={() => document.getElementById('restore-upload')?.click()}
              >
                Select File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
