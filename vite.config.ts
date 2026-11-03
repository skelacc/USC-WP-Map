import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { importApi } from './server/importApi.ts'

export default defineConfig({
  // relative Pfade → der statische Build funktioniert auch aus einem Unterordner
  base: './',
  plugins: [react(), tailwindcss(), importApi()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { host: true },
})
