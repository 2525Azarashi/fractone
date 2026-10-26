// クライアント (React SPA) ビルド → public/static/app.js / app.css
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: false,
  build: {
    outDir: 'public/static',
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/client/main.tsx',
      output: {
        entryFileNames: 'app.js',
        assetFileNames: (a) => (a.names?.[0]?.endsWith('.css') ? 'app.css' : '[name][extname]'),
      },
    },
  },
})
