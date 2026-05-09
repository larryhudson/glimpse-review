import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'src/review-shell',
  base: './',
  plugins: [preact()],
  define: {
    __DEV_SAMPLE_PATH__: JSON.stringify(`/@fs/${resolve('examples/approval-form.html')}`),
  },
  server: {
    fs: {
      allow: ['../..'],
    },
  },
  css: {
    devSourcemap: false,
  },
  build: {
    outDir: '../../dist/review-shell',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'index.html',
      output: {
        entryFileNames: 'review-shell.js',
      },
    },
  },
});
