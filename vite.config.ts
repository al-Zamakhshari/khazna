import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { createHash } from 'node:crypto'

// ── Inline SRI plugin ─────────────────────────────────────────────────────────
// Computes SHA-384 hashes for all JS/CSS chunks and injects integrity +
// crossorigin attributes into the output HTML.  Runs only on `vite build`.
function sriPlugin(): Plugin {
  return {
    name:  'khazna-sri',
    apply: 'build',

    transformIndexHtml: {
      order: 'post',
      handler(html, { bundle }) {
        if (!bundle) return html

        // Build a basename → integrity map from this build's output
        const sri = new Map<string, string>()
        for (const [name, chunk] of Object.entries(bundle)) {
          const content =
            chunk.type === 'chunk'
              ? Buffer.from(chunk.code, 'utf-8')
              : Buffer.from(chunk.source as string | Uint8Array)
          const digest = createHash('sha384').update(content).digest('base64')
          // Store by basename so URL matching is path-agnostic
          const base = name.replace(/^.*\//, '')
          sri.set(base, `sha384-${digest}`)
        }

        const getSri = (url: string) => sri.get(url.replace(/^.*\//, ''))

        // Inject into <script src="…">
        html = html.replace(
          /<script([^>]*?)\ssrc="([^"]+)"([^>]*?)>/g,
          (match, pre, src, post) => {
            const hash = getSri(src)
            if (!hash || match.includes('integrity=')) return match
            return `<script${pre} src="${src}" integrity="${hash}" crossorigin="anonymous"${post}>`
          },
        )

        // Inject into <link href="…"> for stylesheets and modulepreload hints
        html = html.replace(
          /<link([^>]*?)\shref="([^"]+)"([^>]*?)>/g,
          (match, pre, href, post) => {
            if (!match.includes('stylesheet') && !match.includes('modulepreload')) return match
            const hash = getSri(href)
            if (!hash || match.includes('integrity=')) return match
            return `<link${pre} href="${href}" integrity="${hash}" crossorigin="anonymous"${post}>`
          },
        )

        return html
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    sriPlugin(),
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
