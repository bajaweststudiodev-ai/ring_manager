import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // Se actualiza sola cuando haces cambios
      includeAssets: ['favicon.svg', 'logo-gym.png', 'beep-success.mp3'], // Archivos vitales offline
      manifest: {
        name: "Ring Manager - Team Cota's",
        short_name: "RingManager",
        description: "Sistema de Control de Acceso y Gestión",
        theme_color: "#1F2A44",
        background_color: "#fafafa",
        display: "standalone", // Esto oculta la barra de Google Chrome (Modo App nativa)
        icons: [
          {
            src: "/logo-gym.png", // Asegúrate de que tu logo se llame así en la carpeta public
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/logo-gym.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      }
    })
  ]
})