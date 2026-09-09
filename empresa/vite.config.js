import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Base relativa: funciona no GitHub Pages, no APK (Capacitor) e no localhost
export default defineConfig({
  base: './',
  plugins: [react()],
})
