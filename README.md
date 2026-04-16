# 🛡️ Khazna (خزنة)

**Khazna** (Arabic for *Vault* or *Safe*) is a modern, web-based encryption tool built for the age of quantum computing. It allows you to protect your sensitive text and files using world-class Post-Quantum Cryptography (PQC).

## 🚀 Live Demo
**[Access your Khazna here](https://al-zamakhshari.github.io/khazna/)**

## ✨ Key Features
- **Quantum-Resistant:** Powered by **ML-KEM-768** (FIPS 203), the latest global standard for post-quantum key encapsulation.
- **Hybrid Encryption:** Uses **AES-256-GCM** for high-speed, authenticated data encryption.
- **Zero-Knowledge:** Everything happens 100% in your browser. Keys and messages never touch a server.
- **Encrypted Vault:** Store multiple identities and contacts locally, protected by a Master Password (hardened with PBKDF2).
- **File Support:** Encrypt and decrypt small files (PDFs, images, etc.) into the `.khazna` format.
- **Portable & Offline:** Fully functional Progressive Web App (PWA) that works without an internet connection once loaded.
- **Privacy First:** Includes an "Auto-Lock" timer and hidden key toggles for shoulder-surfing protection.

## 🛠️ Technology Stack
- **Framework:** React 19 + TypeScript
- **Bundler:** Vite 8
- **Cryptography:** 
  - `@noble/post-quantum` (ML-KEM)
  - `@noble/ciphers` (AES-GCM)
  - `@noble/hashes` (SHA-256, PBKDF2)
- **Icons:** Lucide React
- **Deployment:** GitHub Actions + GitHub Pages

## 📖 How to Use
1. **Initialize your Vault:** Set a Master Password to protect your local data.
2. **Generate an Identity:** Create a named identity to get your **Khazna Address** (Public) and **Master Key** (Private).
3. **Encrypt:** Paste a recipient's address, type your message or drop a file, and generate an "Encrypted Bundle."
4. **Decrypt:** Use your Master Key to reveal messages or files sent to you.

## 🔒 Security Audit
This codebase has undergone a manual security review and a two-pass SAST analysis to ensure cryptographic integrity and data privacy.

---
Built with ❤️ by [al-Zamakhshari](https://github.com/al-Zamakhshari)
