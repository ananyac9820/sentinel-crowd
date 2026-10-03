import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset paths so the build works on any static host or sub-path.
  base: './',
  build: {
    // TensorFlow.js is large but only loaded when Live Detection opens.
    chunkSizeWarningLimit: 1600,
  },
})
