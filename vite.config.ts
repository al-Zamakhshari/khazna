import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// NOTE: SRI was removed — hashes computed from chunk.code differ from the
// bytes actually written by the CI build (different Node/platform, different
// minifier output → same Vite content-hash filename, different SHA-384).
// The mismatch causes browsers to block the script and show a blank page.
// Proper SRI for a GitHub Pages PWA requires a post-write hash pass (reading
// dist/ after the build) which is out of scope for the web app; this concern
// is addressed in the planned native desktop app instead.

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Khazna Post-Quantum Vault',
        short_name: 'Khazna',
        description: 'Secure, quantum-resistant text and file encryption',
        theme_color: '#0f172a',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  base: './',
})
