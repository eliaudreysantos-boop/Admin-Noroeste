import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  build: {
    target:    'es2020',
    outDir:    'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Mantém os módulos lazy como chunks separados (já funciona por padrão)
        manualChunks: undefined,
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
})
