import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // Runtime writes must never reload the page: the agents append to their own
      // ai-agents/*.md on every call, the server persists data/*.json and rebuilds the
      // extension zip, and images land in public/. Vite treats any of those as a
      // full page reload, which wiped every in-progress job the moment a run finished.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: [
          '**/ai-agents/**',
          '**/data/**',
          '**/public/generated-images/**',
          '**/public/base-photos/**',
          '**/public/*.zip',
          '**/*.md',
          '**/*.log',
          '**/e2e-*.cjs',
        ],
      },
    },
  };
});
