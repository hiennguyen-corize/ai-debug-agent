import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '#components': path.resolve(__dirname, 'src/components'),
      '#stores': path.resolve(__dirname, 'src/stores'),
      '#api': path.resolve(__dirname, 'src/api'),
      '#lib': path.resolve(__dirname, 'src/lib'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3100',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
