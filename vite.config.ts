import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // The password checker loads zxcvbn with its dictionaries (about 1.8 MB) only on its own page.
    // The main bundle is guarded separately by the size check in .github/workflows/ci.yml.
    chunkSizeWarningLimit: 2000,
  },
});
