import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// CAT Sentinel web — dev server on 5173 (CORS origin allowed by edge and cloud APIs).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 5173, host: '127.0.0.1' },
  build: {
    chunkSizeWarningLimit: 1600,
  },
});
