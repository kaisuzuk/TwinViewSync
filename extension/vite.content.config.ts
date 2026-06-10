import { defineConfig } from 'vite';
import { resolve } from 'path';

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
};

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/content.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: 'assets/[name][extname]',
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias,
  },
  plugins: [
    {
      name: 'verify-content-script',
      generateBundle(_options: unknown, bundle: Record<string, { type: string; imports?: string[]; code?: string }>) {
        const contentChunk = bundle['content.js'];

        if (!contentChunk || contentChunk.type !== 'chunk') {
          this.error('content.js was not generated.');
        }

        if ((contentChunk.imports?.length ?? 0) > 0 || /^\s*import\s/m.test(contentChunk.code ?? '')) {
          this.error('content.js must be bundled as a classic script without ESM imports.');
        }
      },
    },
  ],
});
