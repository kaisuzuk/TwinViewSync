import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        content: resolve(__dirname, 'src/content/content.ts'),
        popup: resolve(__dirname, 'src/popup/popup.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  plugins: [
    {
      // Copy static assets (popup.html, manifest.json, icons)
      name: 'copy-static',
      writeBundle() {
        const fs = require('fs');
        const path = require('path');

        // Copy manifest.json
        fs.copyFileSync(
          path.resolve(__dirname, 'manifest.json'),
          path.resolve(__dirname, 'dist/manifest.json')
        );

        // Copy popup.html
        fs.copyFileSync(
          path.resolve(__dirname, 'src/popup/popup.html'),
          path.resolve(__dirname, 'dist/popup.html')
        );

        // Copy popup.css
        fs.copyFileSync(
          path.resolve(__dirname, 'src/popup/popup.css'),
          path.resolve(__dirname, 'dist/popup.css')
        );

        // Copy icons directory if exists
        const iconsDir = path.resolve(__dirname, 'icons');
        const distIconsDir = path.resolve(__dirname, 'dist/icons');
        if (fs.existsSync(iconsDir)) {
          fs.mkdirSync(distIconsDir, { recursive: true });
          fs.readdirSync(iconsDir).forEach((file: string) => {
            fs.copyFileSync(
              path.join(iconsDir, file),
              path.join(distIconsDir, file)
            );
          });
        }
      },
    },
  ],
});
