import { useState, useEffect } from 'react'
import './App.css'
import { EncryptTab } from './components/EncryptTab'
import { DecryptTab } from './components/DecryptTab'
import { VaultTab } from './components/VaultTab'
import { GuideTab } from './components/GuideTab'
import { useVault } from './hooks/useVault'
import { Shield, Info, Sun, Moon, Database, HelpCircle, User, Lock } from 'lucide-react'
import { type PQCKeyPair } from './utils/crypto'

type Tab = 'vault' | 'encrypt' | 'decrypt' | 'guide'

interface ActiveIdentity {
  name: string;
  keys: PQCKeyPair;
}

function App() {
  const vaultManager = useVault();
  const [activeTab, setActiveTab] = useState<Tab>('vault')
  const [activeIdentity, setActiveIdentity] = useState<ActiveIdentity | null>(null)
  const [targetPublicKey, setTargetPublicKey] = useState<string>('')
  const [theme, setTheme] = useState<'light' | 'dark'>(
    (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const logout = () => {
    setActiveIdentity(null);
    vaultManager.lock();
    setActiveTab('vault');
  };

  return (
    <div className="container">
      <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', gap: '10px' }}>
        <button 
          className="copy-btn" 
          style={{ height: '40px', borderRadius: '20px', padding: '0 1rem' }} 
          onClick={() => setActiveTab('guide')}
        >
          <HelpCircle size={18} style={{ marginRight: '6px' }} /> Help
        </button>
        <button className="theme-toggle" onClick={toggleTheme} style={{ position: 'static' }}>
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
        {!vaultManager.isLocked && (
          <button className="theme-toggle" onClick={logout} title="Lock Vault" style={{ position: 'static', color: 'var(--error)' }}>
            <Lock size={20} />
          </button>
        )}
      </div>

      <header style={{ marginBottom: '3rem' }}>
        <h1>
          <Shield size={40} style={{ verticalAlign: 'middle', marginRight: '16px', color: 'var(--primary)' }} />
          Khazna
        </h1>
        <p className="subtitle">
          Post-Quantum Security Vault
          <br />
          <span style={{ fontSize: '0.875rem', opacity: 0.8 }}>
            ML-KEM-768 (FIPS 203) & AES-256-GCM
          </span>
        </p>
      </header>

      <div className="card">
        <nav className="tabs">
          <button className={`tab-btn ${activeTab === 'vault' ? 'active' : ''}`} onClick={() => setActiveTab('vault')}>
            <Database size={16} style={{ marginRight: '8px' }} /> Vault
          </button>
          <button className={`tab-btn ${activeTab === 'encrypt' ? 'active' : ''}`} onClick={() => setActiveTab('encrypt')}>
            Encrypt
          </button>
          <button className={`tab-btn ${activeTab === 'decrypt' ? 'active' : ''}`} onClick={() => setActiveTab('decrypt')}>
            Decrypt
          </button>
        </nav>

        <main>
          {activeTab === 'vault' && (
            <VaultTab 
              manager={vaultManager}
              activeIdentity={activeIdentity}
              onIdentitySelect={(id) => { setActiveIdentity({ name: id.name, keys: id.keys }); }} 
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
            />
          )}
          {activeTab === 'guide' && <GuideTab />}
        </main>
      </div>

      {activeIdentity && (
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <div className="alert alert-success" style={{ display: 'inline-flex', padding: '0.5rem 1.25rem', fontSize: '0.75rem', borderRadius: '100px', alignItems: 'center', gap: '8px' }}>
            <User size={14} />
            <span>Active Identity: <strong>{activeIdentity.name}</strong></span>
            <span style={{ opacity: 0.3 }}>|</span>
            <button onClick={() => setActiveIdentity(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: 'inherit', padding: 0 }}>
              Deselect
            </button>
          </div>
        </div>
      )}

      <footer style={{ marginTop: '4rem', padding: '1rem', textAlign: 'center' }}>
        <div className="alert alert-info" style={{ display: 'inline-flex', marginBottom: '1.5rem', width: 'auto' }}>
          <Info size={16} style={{ flexShrink: 0 }} />
          <span>Everything is stored locally and encrypted with your Master Password.</span>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          &copy; {new Date().getFullYear()} Khazna Tool. Built with @noble/post-quantum.
        </p>
      </footer>
    </div>
  )
}

export default App
