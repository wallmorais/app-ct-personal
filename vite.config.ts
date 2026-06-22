import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png'],
      devOptions: { enabled: true },
      manifest: {
        name: 'PT.Control — Wal Morais',
        short_name: 'PT.Control',
        description: 'Controle de aulas, presenças e faturamento para personal trainer.',
        start_url: '/',
        display: 'standalone',
        background_color: '#0B0F0E',
        theme_color: '#0B0F0E',
        icons: [
          { src: '/logo.png', sizes: '192x192', type: 'image/png' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  // host: true expõe o servidor na rede local (acesso pelo celular via Wi-Fi)
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
})
