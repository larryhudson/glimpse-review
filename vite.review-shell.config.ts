import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { dirname, resolve } from 'node:path';

const devSample = process.env.GLIMPSE_DEV_SAMPLE
  ? resolve(process.env.GLIMPSE_DEV_SAMPLE)
  : resolve('examples/approval-form.html');

export default defineConfig({
  root: 'src/review-shell',
  base: './',
  plugins: [preact()],
  define: {
    __DEV_SAMPLE_PATH__: JSON.stringify(`/@fs/${devSample}`),
  },
  server: {
    fs: {
      allow: ['../..', dirname(devSample)],
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
