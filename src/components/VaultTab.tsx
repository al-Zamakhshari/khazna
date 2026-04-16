import React, { useState } from 'react';
import { type PQCKeyPair } from '../utils/crypto';
import { Lock, Unlock, Shield, User, Users, Plus, Trash2, Eye, EyeOff, FolderPlus, QrCode, Copy, Download, PlusCircle, Check, RefreshCw, Upload, FileJson, Cloud, CloudDownload, CloudUpload } from 'lucide-react';
import { useVault } from '../hooks/useVault';
import { QRCodeSVG } from 'qrcode.react';
import { getGoogleAccessToken, uploadToDrive, findBackupFile, downloadFromDrive } from '../utils/googleDrive';

interface VaultTabProps {
  manager: ReturnType<typeof useVault>;
  activeIdentity: { name: string; keys: PQCKeyPair } | null;
  onIdentitySelect: (id: { name: string; keys: PQCKeyPair }) => void;
  onContactSelect: (publicKey: string) => void;
}

export const VaultTab: React.FC<VaultTabProps> = ({ manager, activeIdentity, onIdentitySelect, onContactSelect }) => {
  const [pwdInput, setPwdInput] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'identities' | 'contacts' | 'settings'>('identities');
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [showKeysMap, setShowKeysMap] = useState<Record<string, boolean>>({});
  const [showQRMap, setShowQRMap] = useState<Record<string, boolean>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');

  const { vault, isLocked, isNew, error, unlock, initialize, addIdentity, addContact, removeItem, reset } = manager;

  const downloadKey = (text: string, filename: string) => {
    const element = document.createElement("a");
    const file = new Blob([text], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
  };

  const handleBackup = () => {
    const encryptedData = localStorage.getItem('khazna_v2_vault');
    if (!encryptedData) return;
    const blob = new Blob([encryptedData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `khazna-vault-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      localStorage.setItem('khazna_v2_vault', content);
      window.location.reload();
    };
    reader.readAsText(file);
  };

  const syncToCloud = async () => {
    try {
      setIsSyncing(true);
      setSyncStatus('Authorizing...');
      const token = await getGoogleAccessToken();
      
      setSyncStatus('Uploading...');
      const encryptedData = localStorage.getItem('khazna_v2_vault');
      if (!encryptedData) throw new Error('No local data to sync');
      
      await uploadToDrive(token, encryptedData);
      setSyncStatus('✅ Synced to Cloud');
      setTimeout(() => setSyncStatus(''), 3000);
    } catch (err: any) {
      setSyncStatus(`❌ Error: ${err.message || 'Sync failed'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const restoreFromCloud = async () => {
    try {
      setIsSyncing(true);
      setSyncStatus('Authorizing...');
      const token = await getGoogleAccessToken();
      
      setSyncStatus('Searching for backup...');
      const fileInfo = await findBackupFile(token);
      if (!fileInfo) throw new Error('No backup found in Google Drive');
      
      if (!confirm(`Restore backup from ${new Date(fileInfo.modifiedTime).toLocaleString()}? Current local data will be replaced.`)) return;
      
      setSyncStatus('Downloading...');
      const content = await downloadFromDrive(token, fileInfo.id);
      localStorage.setItem('khazna_v2_vault', content);
      window.location.reload();
    } catch (err: any) {
      setSyncStatus(`❌ Error: ${err.message || 'Restore failed'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isNew) {
    return (
      <div className="space-y-6">
        <div className="alert alert-info">
          <FolderPlus size={20} />
          <div><strong>Create Your Khazna Vault:</strong> Set a master password to encrypt your PQC keys and contacts in this browser.</div>
        </div>
        <input type="password" placeholder="Master Password" value={pwdInput} onChange={e => setPwdInput(e.target.value)} />
        <input type="password" placeholder="Confirm Password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn" onClick={() => initialize(pwdInput)} disabled={!pwdInput || pwdInput !== confirmPwd}>
          Initialize Vault
        </button>
        
        <div className="card" style={{ marginTop: '2rem', padding: '1.5rem', borderStyle: 'dashed' }}>
          <h4 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cloud size={18} /> Cloud Recovery
          </h4>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Already have a vault synced to Google Drive? Restore it here.
          </p>
          <button className="btn" style={{ background: 'var(--text-muted)' }} onClick={restoreFromCloud} disabled={isSyncing}>
            {isSyncing ? syncStatus : 'Restore from Google Drive'}
          </button>
          
          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
            <label style={{ marginBottom: '1rem', display: 'block' }}><Upload size={16} /> Restore from .json file</label>
            <input type="file" accept=".json" onChange={handleRestore} />
          </div>
        </div>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="space-y-6">
        <div className="alert alert-info">
          <Lock size={20} />
          <span>Unlock your Khazna Vault.</span>
        </div>
        <input 
          type="password" 
          placeholder="Vault Password" 
          value={pwdInput} 
          onChange={e => setPwdInput(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && unlock(pwdInput)}
        />
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn" onClick={() => unlock(pwdInput)}>
          <Unlock size={18} style={{ marginRight: '8px' }} /> Unlock Vault
        </button>
        <button 
          className="btn" 
          style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }} 
          onClick={() => { if(confirm('RESET VAULT? This will delete ALL keys in this browser forever.')) reset(); }}
        >
          <RefreshCw size={16} style={{ marginRight: '8px' }} /> Reset & Wipe Everything
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="tabs">
        <button className={`tab-btn ${activeSubTab === 'identities' ? 'active' : ''}`} onClick={() => setActiveSubTab('identities')}>
          <User size={16} /> My Identities
        </button>
        <button className={`tab-btn ${activeSubTab === 'contacts' ? 'active' : ''}`} onClick={() => setActiveSubTab('contacts')}>
          <Users size={16} /> Contacts
        </button>
        <button className={`tab-btn ${activeSubTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveSubTab('settings')}>
          Sync & Backup
        </button>
      </div>

      {activeSubTab === 'identities' && (
        <div className="space-y-4">
          {!isCreating ? (
            <button className="btn" style={{ background: 'transparent', border: '2px dashed var(--border)', color: 'var(--text-muted)' }} onClick={() => setIsCreating(true)}>
              <PlusCircle size={18} style={{ marginRight: '8px' }} /> Add New Identity
            </button>
          ) : (
            <div className="card" style={{ padding: '1.25rem', borderColor: 'var(--primary)' }}>
              <label>Identity Nickname</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input placeholder="e.g. Work, Personal" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
                <button className="btn" style={{ width: 'auto' }} onClick={() => { addIdentity(newName); setNewName(''); setIsCreating(false); }}>
                  <Check size={18} />
                </button>
                <button className="btn" style={{ width: 'auto', background: 'var(--text-muted)' }} onClick={() => setIsCreating(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {vault?.identities.length === 0 && !isCreating && (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <Shield size={48} style={{ opacity: 0.1, marginBottom: '1rem' }} />
              <p style={{ color: 'var(--text-muted)' }}>No identities yet.</p>
            </div>
          )}

          {vault?.identities.map(id => {
            const isActive = activeIdentity?.keys.publicKey === id.keys.publicKey;
            return (
              <div key={id.id} className="result-area" style={{ marginTop: 0, border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)' }}>
                <div className="result-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Shield size={18} color={isActive ? "var(--primary)" : "var(--text-muted)"} />
                    <strong>{id.name}</strong>
                    {isActive && <span className="alert-success" style={{ padding: '2px 8px', fontSize: '0.6rem', borderRadius: '4px' }}>ACTIVE</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="copy-btn" onClick={() => onIdentitySelect(id)} disabled={isActive}>
                      {isActive ? 'Active' : 'Select'}
                    </button>
                    <button className="copy-btn" onClick={() => setShowQRMap(p => ({...p, [id.id]: !p[id.id]}))}>
                      <QrCode size={14} />
                    </button>
                    <button className="copy-btn" onClick={() => setShowKeysMap(p => ({...p, [id.id]: !p[id.id]}))}>
                      {showKeysMap[id.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button className="copy-btn" onClick={() => removeItem(id.id, 'identities')} style={{ color: 'var(--error)' }}><Trash2 size={14} /></button>
                  </div>
                </div>

                {showQRMap[id.id] && (
                  <div className="qr-container" style={{ background: 'white', padding: '10px', marginBottom: '1rem' }}>
                    <QRCodeSVG value={id.keys.publicKey} size={200} />
                  </div>
                )}

                {showKeysMap[id.id] && (
                  <div className="space-y-4" style={{ marginBottom: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Public Address</label>
                      <div className="key-display" style={{ fontSize: '0.65rem' }}>{id.keys.publicKey}</div>
                      <button className="copy-btn" style={{ marginTop: '0.5rem' }} onClick={() => navigator.clipboard.writeText(id.keys.publicKey)}>
                        <Copy size={12} /> Copy Address
                      </button>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--error)' }}>Master Key</label>
                      <div className="key-display" style={{ fontSize: '0.65rem', background: 'rgba(239, 68, 68, 0.05)' }}>{id.keys.privateKey}</div>
                      <button className="copy-btn" style={{ marginTop: '0.5rem' }} onClick={() => downloadKey(id.keys.privateKey, `${id.name}-private-key.txt`)}>
                        <Download size={12} /> Download Key
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeSubTab === 'contacts' && (
        <div className="space-y-4">
          <div className="card" style={{ padding: '1.25rem', borderStyle: 'dashed', background: 'transparent' }}>
            <label>Save Contact</label>
            <input placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} style={{ marginBottom: '0.5rem' }} />
            <textarea placeholder="Paste Khazna Address" value={newKey} onChange={e => setNewKey(e.target.value)} style={{ height: '80px', marginBottom: '0.5rem' }} />
            <button className="btn" onClick={() => { addContact(newName, newKey); setNewName(''); setNewKey(''); }} disabled={!newName || !newKey}>
              <Plus size={16} /> Save Contact
            </button>
          </div>
          {vault?.contacts.map(c => (
            <div key={c.id} className="result-area" style={{ marginTop: 0 }}>
              <div className="result-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <User size={18} />
                  <strong>{c.name}</strong>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="copy-btn" onClick={() => onContactSelect(c.publicKey)}>Encrypt To</button>
                  <button className="copy-btn" onClick={() => removeItem(c.id, 'contacts')} style={{ color: 'var(--error)' }}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSubTab === 'settings' && (
        <div className="space-y-6">
          <div className="card" style={{ padding: '2rem', textAlign: 'center', borderColor: 'var(--primary)' }}>
            <Cloud size={48} style={{ margin: '0 auto 1.5rem', color: 'var(--primary)' }} />
            <h3>Google Drive Sync</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
              Securely sync your encrypted vault to your personal Google Drive. 
              This allows you to access your keys on any device.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn" onClick={syncToCloud} disabled={isSyncing}>
                <CloudUpload size={18} style={{ marginRight: '8px' }} />
                {isSyncing ? 'Syncing...' : 'Sync to Cloud'}
              </button>
              <button className="btn" style={{ background: 'var(--text-muted)' }} onClick={restoreFromCloud} disabled={isSyncing}>
                <CloudDownload size={18} style={{ marginRight: '8px' }} />
                Restore from Cloud
              </button>
            </div>
            {syncStatus && (
              <div className="alert alert-info" style={{ marginTop: '1.5rem', marginBottom: 0 }}>
                {syncStatus}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <div className="card" style={{ flex: 1, padding: '1.5rem', textAlign: 'center' }}>
              <FileJson size={24} style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }} />
              <h4 style={{ margin: '0 0 1rem 0' }}>Manual Backup</h4>
              <button className="copy-btn" style={{ margin: '0 auto' }} onClick={handleBackup}>
                <Download size={14} /> Download .json
              </button>
            </div>

            <div className="card" style={{ flex: 1, padding: '1.5rem', textAlign: 'center', borderStyle: 'dashed' }}>
              <Upload size={24} style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }} />
              <h4 style={{ margin: '0 0 1rem 0' }}>Manual Restore</h4>
              <input type="file" accept=".json" onChange={handleRestore} style={{ display: 'none' }} id="restore-upload-manual" />
              <button className="copy-btn" style={{ margin: '0 auto' }} onClick={() => document.getElementById('restore-upload-manual')?.click()}>
                Select File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
