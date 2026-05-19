import { useState, useEffect } from 'react'
import './App.css'
import { EncryptTab } from './components/EncryptTab'
import { DecryptTab } from './components/DecryptTab'
import { VaultTab } from './components/VaultTab'
import { GuideTab } from './components/GuideTab'
import { useVault } from './hooks/useVault'
import { Shield, Info, Sun, Moon, Database, HelpCircle, User, Lock, Unlock, X } from 'lucide-react'
import { type PQCKeyPair } from './utils/crypto'

type Tab = 'vault' | 'encrypt' | 'decrypt'

interface ActiveIdentity {
  name: string;
  keys: PQCKeyPair;
}

function App() {
  const vaultManager = useVault();
  const [activeTab, setActiveTab] = useState<Tab>('vault')
  const [activeIdentity, setActiveIdentity] = useState<ActiveIdentity | null>(null)
  const [targetPublicKey, setTargetPublicKey] = useState<string>('')
  const [showHelp, setShowHelp] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(
    (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Close help modal on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowHelp(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const logout = () => {
    setActiveIdentity(null);
    vaultManager.lock();
    setActiveTab('vault');
  };

  return (
    <div className="container">
      <header className="app-header">
        <div className="header-brand">
          <h1>
            <Shield size={28} style={{ verticalAlign: 'middle', marginRight: '10px', color: 'var(--primary)' }} />
            Khazna
          </h1>
          <p className="subtitle">Post-Quantum Security Vault</p>
        </div>
        <div className="header-actions">
          <button className="header-btn" onClick={() => setShowHelp(true)}>
            <HelpCircle size={15} /> Help
          </button>
          <button
            className="header-btn icon-only"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          {!vaultManager.isLocked && (
            <button className="header-btn icon-only danger" onClick={logout} title="Lock vault">
              <Lock size={17} />
            </button>
          )}
        </div>
      </header>

      <div className="card">
        {activeIdentity && (
          <div className="identity-bar">
            <User size={13} />
            <span>Active identity: <strong>{activeIdentity.name}</strong></span>
            <button className="deselect-btn" onClick={() => setActiveIdentity(null)}>
              Deselect
            </button>
          </div>
        )}

        <nav className="tabs">
          <button
            className={`tab-btn ${activeTab === 'vault' ? 'active' : ''}`}
            onClick={() => setActiveTab('vault')}
          >
            <Database size={15} /> Vault
          </button>
          <button
            className={`tab-btn ${activeTab === 'encrypt' ? 'active' : ''}`}
            onClick={() => setActiveTab('encrypt')}
          >
            <Lock size={15} /> Encrypt
          </button>
          <button
            className={`tab-btn ${activeTab === 'decrypt' ? 'active' : ''}`}
            onClick={() => setActiveTab('decrypt')}
          >
            <Unlock size={15} /> Decrypt
          </button>
        </nav>

        <main>
          {activeTab === 'vault' && (
            <VaultTab
              manager={vaultManager}
              activeIdentity={activeIdentity}
              onIdentitySelect={(id) => setActiveIdentity({ name: id.name, keys: id.keys })}
              onContactSelect={(pk) => { setTargetPublicKey(pk); setActiveTab('encrypt'); }}
            />
          )}
          {activeTab === 'encrypt' && (
            <EncryptTab
              keys={activeIdentity?.keys || null}
              prefilledKey={targetPublicKey}
            />
          )}
          {activeTab === 'decrypt' && (
            <DecryptTab
              keys={activeIdentity?.keys || null}
              onGoToVault={() => setActiveTab('vault')}
            />
          )}
        </main>
      </div>

      <footer style={{ marginTop: '3rem', padding: '1rem', textAlign: 'center' }}>
        <div className="alert alert-info" style={{ display: 'inline-flex', marginBottom: '1rem', width: 'auto' }}>
          <Info size={15} style={{ flexShrink: 0 }} />
          <span>Everything is stored locally and encrypted with your Master Password.</span>
        </div>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          &copy; {new Date().getFullYear()} Khazna &mdash; ML-KEM-768 + X25519 &middot; AES-256-GCM &middot; PBKDF2-SHA-256
        </p>
      </footer>

      {showHelp && (
        <div className="modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowHelp(false)} aria-label="Close help">
              <X size={15} />
            </button>
            <GuideTab />
          </div>
        </div>
      )}
    </div>
  )
}

export default App
