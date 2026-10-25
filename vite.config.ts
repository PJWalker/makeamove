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
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Make a Move',
        short_name: 'Make a Move',
        description: 'A peer-to-peer virtual tabletop.',
        theme_color: '#14161c',
        background_color: '#14161c',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
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
