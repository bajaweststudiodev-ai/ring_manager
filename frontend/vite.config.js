import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // VitePWA inyecta el <link rel="manifest"> automáticamente en el HTML
      // generado. El archivo public/manifest.json ya no es necesario.
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'logo.png', 'logo-gym.png', 'beep-success.mp3'],

      workbox: {
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,

        // Glob atrapa assets con extensión conocida.
        // Los archivos shard de face-api NO tienen extensión (*-shard1, *-shard2)
        // y nunca serían capturados aquí — por eso se listan en
        // additionalManifestEntries abajo.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,mp3,json,bin}'],
        // El shard más grande es face_recognition_model-shard1 (~4 MB).
        // El límite default de Workbox es 2 MB → lo sube a 10 MB para cubrir todos los shards.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,

        // ── SHARDS DE FACE-API (SIN EXTENSIÓN) ───────────────────────────────
        // Los archivos *-shard1 / *-shard2 son los pesos reales de la red neuronal.
        // No tienen extensión de archivo, por lo que ningún globPattern los captura.
        // Con revision:null Workbox los cachea sin revisión (correcto: los modelos
        // no cambian entre versiones de la app).
        //
        // Modelos activos en faceService.js:
        //   tinyFaceDetector  → ~189 KB  (detector principal en CPU)
        //   faceLandmark68Net → ~349 KB  (68 puntos de landmarks)
        //   faceRecognitionNet → ~6.3 MB  (descriptor 128-dim, 2 shards)
        //   ssdMobilenetv1    → ~5.5 MB  (fallback opcional, 2 shards)
        //
        // NO se incluyen: mtcnn, age_gender, face_expression, landmark_68_tiny
        // (no están en el initFaceApi() actual).
        additionalManifestEntries: [
          { url: 'models/tiny_face_detector_model-shard1',    revision: null },
          { url: 'models/face_landmark_68_model-shard1',      revision: null },
          { url: 'models/face_recognition_model-shard1',      revision: null },
          { url: 'models/face_recognition_model-shard2',      revision: null },
          { url: 'models/ssd_mobilenetv1_model-shard1',       revision: null },
          { url: 'models/ssd_mobilenetv1_model-shard2',       revision: null },
        ],
      },

      manifest: {
        name: "Ring Manager - Team Cota's",
        short_name: 'RingManager',
        description: 'Sistema de Control de Acceso y Gestión de Gimnasio',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1F2A44',
        background_color: '#fafafa',
        // iOS requiere al menos un icono en cada tamaño que usa internamente.
        // 'any maskable' permite que Android recorte el icono con forma de squircle.
        icons: [
          { src: '/logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    })
    
  ],
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:5000', changeOrigin: true },
    },
  },
  preview: {
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:5000', changeOrigin: true },
    },
  },
})