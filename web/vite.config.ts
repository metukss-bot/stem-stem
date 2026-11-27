import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 주소: https://metukss-bot.github.io/stem-stem/
// 안드로이드 앱(Capacitor) 빌드는 APP_BUILD=android 로 하며, 앱 안에 파일이 들어가므로 서비스워커가 필요 없음
const isAndroid = process.env.APP_BUILD === 'android'

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    !isAndroid && VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'StemStem 합주 플레이어',
        short_name: 'StemStem',
        description: '밴드 합주용 스템 플레이어',
        lang: 'ko',
        theme_color: '#111214',
        background_color: '#111214',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { navigateFallback: 'index.html' },
    }),
  ],
})
