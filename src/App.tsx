import { useState, useEffect } from 'react'
import './App.css'
import { EncryptTab }   from './components/EncryptTab'
import { DecryptTab }   from './components/DecryptTab'
import { VaultTab }     from './components/VaultTab'
import { GuideTab }     from './components/GuideTab'
import { MessagesTab }  from './components/MessagesTab'
import { useVault }     from './hooks/useVault'
import { buildProfileEvent, publishEvent } from './utils/nostr'
import {
  Shield, Info, Sun, Moon, Database, HelpCircle,
  User, Lock, Unlock, MessageSquare, X, AlertTriangle, RefreshCw,
} from 'lucide-react'
import { type PQCKeyPair } from './utils/crypto'

type Tab = 'vault' | 'encrypt' | 'decrypt' | 'messages'

interface ActiveIdentity {
  name: string;
  keys: PQCKeyPair;
}

function App() {
  const vm = useVault();
  const [activeTab,       setActiveTab]       = useState<Tab>('vault')
  const [activeIdentity,  setActiveIdentity]  = useState<ActiveIdentity | null>(null)
  const [targetPublicKey, setTargetPublicKey] = useState<string>('')
  const [showHelp,        setShowHelp]        = useState(false)
  const [showFooterTip,   setShowFooterTip]   = useState(
    !localStorage.getItem('khazna_tip_seen')
  )
  const [theme, setTheme] = useState<'light' | 'dark'>(
    (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowHelp(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Auto-select the only identity whenever the vault unlocks or gains its first identity.
  const identityCount = vm.vault?.identities.length ?? 0;
  useEffect(() => {
    if (vm.isLocked || activeIdentity || !vm.vault) return;
    if (identityCount === 1) {
      const id = vm.vault.identities[0];
      setActiveIdentity({ name: id.name, keys: id.keys });
    }
  }, [vm.isLocked, identityCount]);

  // Dismiss the "stored locally" footer tip once the vault has been unlocked at least once.
  useEffect(() => {
    if (!vm.isLocked && showFooterTip) {
      localStorage.setItem('khazna_tip_seen', '1');
      setShowFooterTip(false);
    }
  }, [vm.isLocked]);

  // Auto-renew session key when it's < 1 day from expiry and the vault is unlocked
  useEffect(() => {
    if (vm.isLocked || !vm.vault?.sessionKey) return;
    const daysLeft = (vm.vault.sessionKey.expiry - Date.now()) / 86_400_000;
    if (daysLeft > 0 && daysLeft < 1) {
      vm.rotateSessionKey();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm.isLocked, vm.vault?.sessionKey?.expiry]);

  const toggleTheme = () => setTheme(p => p === 'light' ? 'dark' : 'light');

  const logout = () => {
    setActiveIdentity(null);
    vm.lock();
    setActiveTab('vault');
  };

  // ── Nostr / session / prekey handlers ──────────────────────────────────────

  // Atomic first-time setup: nostr key + session key + prekeys in one vault write.
  const handleInitMessaging = async () => vm.initMessaging();

  const handleEnsureSession = async (): Promise<string | null> => {
    const keys = await vm.ensureSessionKey();
    return keys?.publicKey ?? null;
  };

  const handlePublishProfile = async (displayName: string, sessionPub?: string) => {
    if (!vm.vault?.nostrPrivateKey || !activeIdentity) return;
    await publishEvent(buildProfileEvent(
      displayName,
      activeIdentity.keys.publicKey,
      vm.vault.nostrPrivateKey,
      sessionPub,
    ));
  };

  const handleRotateSession = async () => { await vm.rotateSessionKey(); };
  const handleGeneratePrekeys = async () => vm.generatePrekeys();

  const keyOps = {
    longTermKeys:         activeIdentity?.keys ?? null,
    sessionKeys:          vm.vault?.sessionKey?.keys ?? null,
    getPrekeyPrivKey:     vm.getPrekeyPrivKey,
    consumePrekey:        vm.consumePrekey,
    updateContactSession: vm.updateContactSession,
    getContactById:       (id: string) => vm.vault?.contacts.find(c => c.id === id),
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
            <HelpCircle size={15} />
            <span className="tab-label">Help</span>
          </button>
          <button className="header-btn icon-only" onClick={toggleTheme}
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}>
            {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          {!vm.isLocked && (
            <button className="header-btn icon-only danger" onClick={logout} title="Lock vault">
              <Lock size={17} />
            </button>
          )}
        </div>
      </header>

      {/* Session expiry warning banner */}
      {vm.isSessionExpiringSoon && vm.vault?.sessionKey && (
        <div className="alert alert-info" style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, color: 'var(--warning, #f59e0b)' }} />
          <span style={{ flex: 1 }}>
            Your session key expires in <strong>{vm.sessionDaysLeft}d</strong> — click Renew to extend forward secrecy.
          </span>
          <button
            className="copy-btn"
            style={{ whiteSpace: 'nowrap' }}
            onClick={async () => {
              await vm.rotateSessionKey();
              if (activeIdentity && vm.vault?.nostrPrivateKey) {
                const keys = await vm.ensureSessionKey();
                await publishEvent(buildProfileEvent(
                  activeIdentity.name,
                  activeIdentity.keys.publicKey,
                  vm.vault.nostrPrivateKey,
                  keys?.publicKey,
                ));
              }
            }}
          >
            <RefreshCw size={12} /> Renew
          </button>
        </div>
      )}

      {/* Cross-tab sync banner */}
      {vm.crossTabUpdate && (
        <div className="alert alert-info" style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <RefreshCw size={15} style={{ flexShrink: 0 }} />
          <span>Vault updated in another tab — this view has been refreshed.</span>
        </div>
      )}

      <div className="card">
        {activeIdentity && (
          <div className="identity-bar">
            <User size={13} />
            <span>Active: <strong>{activeIdentity.name}</strong></span>
            <button className="deselect-btn" onClick={() => setActiveIdentity(null)}>Deselect</button>
          </div>
        )}

        <nav className="tabs">
          <button className={`tab-btn ${activeTab === 'vault'    ? 'active' : ''}`} onClick={() => setActiveTab('vault')}>
            <Database size={15} /><span className="tab-label">Vault</span>
          </button>
          <button className={`tab-btn ${activeTab === 'messages' ? 'active' : ''}`} onClick={() => setActiveTab('messages')}>
            <MessageSquare size={15} /><span className="tab-label">Messages</span>
          </button>
          <button className={`tab-btn ${activeTab === 'encrypt'  ? 'active' : ''}`} onClick={() => setActiveTab('encrypt')}>
            <Lock size={15} /><span className="tab-label">Encrypt</span>
          </button>
          <button className={`tab-btn ${activeTab === 'decrypt'  ? 'active' : ''}`} onClick={() => setActiveTab('decrypt')}>
            <Unlock size={15} /><span className="tab-label">Decrypt</span>
          </button>
        </nav>

        <main>
          {activeTab === 'vault' && (
            <VaultTab
              manager={vm}
              activeIdentity={activeIdentity}
              onIdentitySelect={id => setActiveIdentity({ name: id.name, keys: id.keys })}
              onContactSelect={pk => { setTargetPublicKey(pk); setActiveTab('encrypt'); }}
            />
          )}
          {activeTab === 'messages' && (
            <MessagesTab
              nostrPrivKeyHex={vm.vault?.nostrPrivateKey}
              keyOps={keyOps}
              contacts={vm.vault?.contacts ?? []}
              sessionKey={vm.vault?.sessionKey}
              prekeyCount={vm.getPrekeyCount()}
              onAddContact={vm.addContact}
              onInitMessaging={handleInitMessaging}
              onEnsureSession={handleEnsureSession}
              onPublishProfile={handlePublishProfile}
              onRotateSession={handleRotateSession}
              onGeneratePrekeys={handleGeneratePrekeys}
              onGoToVault={() => setActiveTab('vault')}
              activeIdentityName={activeIdentity?.name ?? null}
            />
          )}
          {activeTab === 'encrypt' && (
            <EncryptTab keys={activeIdentity?.keys ?? null} prefilledKey={targetPublicKey} />
          )}
          {activeTab === 'decrypt' && (
            <DecryptTab keys={activeIdentity?.keys ?? null} onGoToVault={() => setActiveTab('vault')} />
          )}
        </main>
      </div>

      <footer style={{ marginTop: '3rem', padding: '1rem', textAlign: 'center' }}>
        {showFooterTip && (
          <div className="alert alert-info" style={{ display: 'inline-flex', marginBottom: '1rem', width: 'auto', gap: '10px' }}>
            <Info size={15} style={{ flexShrink: 0 }} />
            <span>Everything is stored locally and encrypted with your Master Password.</span>
            <button onClick={() => { localStorage.setItem('khazna_tip_seen','1'); setShowFooterTip(false); }}
              style={{ background:'none', border:'none', cursor:'pointer', color:'inherit', padding:0, marginLeft:4, fontSize:'1rem' }}>×</button>
          </div>
        )}
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          &copy; {new Date().getFullYear()} Khazna &mdash; ML-KEM-768 + X25519 &middot; AES-256-GCM &middot; PBKDF2-SHA-256
        </p>
      </footer>

      {showHelp && (
        <div className="modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowHelp(false)} aria-label="Close">
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
