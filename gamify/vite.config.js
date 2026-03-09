import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: '0.0.0.0',       // listen on all interfaces so nginx can reach it
    allowedHosts: true,    // allow ngrok / cloudflare / any external tunnel
    proxy: {
      // Auth API — forward to Express auth containers (Docker exposes :3000 on host)
      '/auth': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      // Game engine REST
      '/api/game': 'http://localhost:4000',
      // Transaction server
      '/api/txn': 'http://localhost:5001',
      // Socket.io WebSocket
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
