import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import legacy from '@vitejs/plugin-legacy'

// Base relativa: funciona no GitHub Pages, no APK (Capacitor) e no localhost
export default defineConfig({
  base: './',
  plugins: [
    react(),
    // Fallback para WebViews Android antigos: gera bundle SystemJS + polyfills
    // Sem isto, <script type=module> falha em silencio e o app fica em tela azul
    legacy({ targets: ['chrome >= 61', 'android >= 6'], modernPolyfills: true }),
  ],
  build: {
    // Compatibilidade maxima com WebViews Android antigos (transpila ?. ?? etc.)
    target: 'es2015',
    rollupOptions: {
      output: {
        // FIX 'Cannot access Te before initialization': colisao de simbolos minificados
        // quando React DOM e MapLibre sao inlineados no mesmo escopo. Separando em chunks
        // cada vendor tem seu escopo proprio — a colisao de nomes fica impossivel.
        advancedChunks: {
          groups: [
            { name: 'vendor-react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'maplibre', test: /[\\/]node_modules[\\/]maplibre-gl[\\/]/ },
            { name: 'vendor-firebase', test: /[\\/]node_modules[\\/]@?firebase[\\/]/ },
          ],
        },
      },
    },
  },
})
