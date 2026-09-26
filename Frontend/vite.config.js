import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Rebuilt clean (original file was flagged by Windows Defender as Trojan:NPM/PolinRider.DG!MTB
// and kept getting quarantined). Aliases mirror jsconfig.json.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@food/api': path.resolve(__dirname, './src/services/api'),
      '@food': path.resolve(__dirname, './src/modules/Food'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@core': path.resolve(__dirname, './src/core'),
      '@common': path.resolve(__dirname, './src/modules/common'),
      '@quickCommerce': path.resolve(__dirname, './src/modules/quickCommerce'),
      '@porter': path.resolve(__dirname, './src/modules/porter'),
      '@delivery': path.resolve(__dirname, './src/modules/DeliveryV2'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
})
