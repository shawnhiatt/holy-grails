import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command, mode }) => {
  // Fail the build loudly when VITE_CONVEX_URL is missing. Without it, Vite
  // statically replaces the guard in main.tsx with an unconditional throw and
  // Rollup dead-code-eliminates the ENTIRE app — the build "succeeds" but
  // ships an empty 176 kB shell.
  const env = loadEnv(mode, process.cwd(), '')
  if (command === 'build' && !env.VITE_CONVEX_URL) {
    throw new Error(
      'VITE_CONVEX_URL is not set. Building without it produces an empty app shell. ' +
      'Set it in .env.local (or the CI/Vercel environment) before building.'
    )
  }

  return {
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' (not 'autoUpdate'): an installed PWA resumed from the
      // background never reloads on its own, so a silent auto-update never
      // reaches the user. Instead we surface an "Update available." toast with
      // a Refresh action (see src/app/lib/pwa-update.ts) and a Settings
      // "Check for updates" control, and reload in place on demand.
      registerType: 'prompt',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/(i|api-img)\.discogs\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'discogs-images-v1',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 1234,
    proxy: {
      '/img-proxy': {
        target: 'https://i.discogs.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/img-proxy/, ''),
      },
    },
  },
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    rollupOptions: {
      output: {
        // Split stable vendors into their own chunks so a one-line app change
        // doesn't invalidate the entire PWA precache on deploy — returning
        // users re-download only the app chunk. Recharts is NOT listed here:
        // it rides in the lazy reports-screen chunk (see App.tsx).
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor'
          if (id.includes('node_modules/convex/')) return 'convex'
          if (/node_modules\/(motion|framer-motion|motion-dom|motion-utils)\//.test(id)) return 'motion'
          return undefined
        },
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})