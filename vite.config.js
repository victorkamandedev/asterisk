import { defineConfig } from 'vite';

export default defineConfig({
  // Serve index.html from project root
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  // Assets (style.css) stay in /assets — Vite copies them as-is
  publicDir: 'assets',
});
