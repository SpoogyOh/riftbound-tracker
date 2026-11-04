import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative asset paths, so the built dist/ works at a domain root or in a subfolder.
  base: './',
  plugins: [tailwindcss()],
  build: { target: 'es2022' },
  server: { host: '127.0.0.1', port: 8765 },
  preview: { host: '127.0.0.1', port: 8765, strictPort: true },
});
