import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  build: {
    target:    'es2020',
    outDir:    'dist',
    sourcemap: false,
    rollupOptions: {
      input: ['index.html', 'agenda/index.html'],
      output: {
        // Mantém os módulos lazy como chunks separados (já funciona por padrão)
        manualChunks: undefined,
      },
    },
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api/import-jw-program': {
        target: 'https://southamerica-east1-reunioes-6c437.cloudfunctions.net',
        changeOrigin: true,
        rewrite: () => '/importJwProgram',
      },
    },
  },
})
