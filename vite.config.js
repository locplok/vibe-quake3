export default {
  root: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    emptyOutDir: true,
  },
  publicDir: 'public',
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    },
    fs: {
      strict: true,
    },
    hmr: {
      overlay: true,
    },
  },
  optimizeDeps: {
    force: true,
  },
  cacheDir: '.vite-cache',
} 