import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/sistema-entregas/admin/',
  plugins: [react()],
})
