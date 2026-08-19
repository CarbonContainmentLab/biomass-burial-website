import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` is the one thing the hosting decision changes (03 §18, §22 item 1).
// Subdomain deploy: leave BASE_URL unset. Path deploy under the CC Lab site:
// BASE_URL=/burial/ npm run build. Every asset path in src/data/paths.ts is
// built from import.meta.env.BASE_URL, so nothing else moves.
export default defineConfig({
  base: process.env.BASE_URL ?? '/',
  plugins: [react()],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    // public/data/* is copied verbatim. sites.bin must keep its name so
    // sites_index.json's `file` field stays true.
    assetsInlineLimit: 0,
    sourcemap: true,
  },
  server: {
    // 5173 unless PORT says otherwise, so a second dev server can run alongside
    // a first rather than failing to bind.
    port: Number(process.env.PORT) || 5173,
  },
});
