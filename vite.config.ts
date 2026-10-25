import preact from '@preact/preset-vite'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    preact(),
    // Icons are compiled into the bundle from local Iconify data, so they work offline.
    Icons({ compiler: 'jsx', jsx: 'preact', scale: 1 }),
    VitePWA({
      registerType: 'autoUpdate',
      // The glob below already precaches every icon; don't list them twice.
      includeManifestIcons: false,
      manifest: {
        name: 'Make a Move',
        short_name: 'Make a Move',
        description: 'A virtual tabletop.',
        theme_color: '#14161c',
        background_color: '#14161c',
        display: 'standalone',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts' },
          },
        ],
      },
    }),
  ],
})
