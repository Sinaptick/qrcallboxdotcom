import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://qrwebaccdb.web.app',
        changeOrigin: true,
        secure: true
      }
    }
  }
})