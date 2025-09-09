import { defineConfig } from 'vite';

export default defineConfig({
  root: 'example',
  server: {
    port: 3000,
  },
  build: {
    outDir: '../dist-example',
  },
});
