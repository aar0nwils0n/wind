import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: resolve(__dirname, '..'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'public'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, '../index.html'),
    },
  },
})
