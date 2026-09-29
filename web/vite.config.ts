import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'runtime-deployment-in-development',
    configureServer(server) {
      // Development reads the same generated runtime manifest/ABIs as production.
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0] ?? '';
        if (!/^\/(imd-deployment\.json|abi\/[A-Za-z][A-Za-z0-9_]*\.json)$/.test(path)) return next();
        try {
          const bytes = await readFile(resolve(import.meta.dirname, '../dist', `.${path}`));
          response.setHeader('Content-Type', 'application/json'); response.end(bytes);
        } catch { response.statusCode = 503; response.end('Run npm run build to generate deployment configuration.'); }
      });
    },
  }],
  build: { outDir: '../dist', emptyOutDir: true, sourcemap: false },
});
