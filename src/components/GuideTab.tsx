import React from 'react';
import { Shield, Key, Database, AlertTriangle, Send } from 'lucide-react';

export const GuideTab: React.FC = () => {
  return (
    <div className="space-y-8" style={{ lineHeight: 1.6 }}>
      <section>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.25rem', marginBottom: '1rem' }}>
          <Shield color="var(--primary)" size={24} /> What is Khazna?
        </h2>
        <p>
          Khazna is a <strong>Post-Quantum Encryption</strong> vault. Traditional encryption (like the kind used in banking today) can theoretically be broken by future quantum computers. Khazna uses <strong>ML-KEM-768</strong>, a new global standard designed to stay secure even in the age of quantum computing.
        </p>
      </section>

      <section className="card" style={{ background: 'var(--bg)', padding: '1.5rem', borderStyle: 'solid' }}>
        <h3 style={{ marginTop: 0, fontSize: '1rem' }}>🚀 Quick Start Guide</h3>
        <ol style={{ paddingLeft: '1.25rem' }}>
          <li style={{ marginBottom: '1rem' }}>
            <strong>Create an Identity:</strong> Go to the <strong>Identity</strong> tab and click "Create". You will get a <strong>Khazna Address</strong> (Public) and a <strong>Master Key</strong> (Private).
          </li>
          <li style={{ marginBottom: '1rem' }}>
            <strong>Share your Address:</strong> Copy your <strong>Khazna Address</strong> and send it to anyone who wants to message you. It is safe to share publicly.
          </li>
          <li style={{ marginBottom: '1rem' }}>
            <strong>Send a Message:</strong> To message someone else, go to <strong>Encrypt</strong>, paste <em>their</em> Khazna Address, type your message, and send them the resulting "Bundle."
          </li>
          <li>
            <strong>Read a Message:</strong> When you receive a bundle, go to <strong>Decrypt</strong>, paste the bundle, and use your <strong>Master Key</strong> to unlock it.
          </li>
        </ol>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div className="result-area" style={{ marginTop: 0 }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 10px 0', fontSize: '0.9rem' }}>
            <Send size={16} /> Public Address
          </h4>
          <p style={{ fontSize: '0.8rem', margin: 0 }}>Think of this like your <strong>Email Address</strong>. You give it to others so they can send you secure mail.</p>
        </div>
        <div className="result-area" style={{ marginTop: 0, borderColor: 'var(--error)' }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--error)' }}>
            <Key size={16} /> Master Key
          </h4>
          <p style={{ fontSize: '0.8rem', margin: 0 }}>Think of this like your <strong>Physical House Key</strong>. Never share it. If you lose it, you can't read your messages.</p>
        </div>
      </div>

      <section>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
          <Database size={18} /> The Vault & Safety
        </h3>
        <p style={{ fontSize: '0.875rem' }}>
          The <strong>Vault</strong> allows you to store your keys and contacts in this browser. 
          Everything is encrypted with your <strong>Master Password</strong>. 
          <br /><br />
          <AlertTriangle size={14} style={{ color: '#f59e0b', marginRight: '4px' }} />
          <strong>Privacy Note:</strong> Khazna is 100% "Zero-Knowledge." We never see your keys or messages. Everything stays in your browser's memory.
        </p>
      </section>
    </div>
  );
};
