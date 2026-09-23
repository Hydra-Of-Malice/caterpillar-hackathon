import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// CAT Sentinel web — dev server on 5173 (CORS origin allowed by edge and cloud APIs).
export default defineConfig({
  plugins: [react()],
  // `host: true` binds every interface so another device on the same wifi can reach the dev
  // server. For the real demo use the tunnel instead: browsers only give geolocation to
  // HTTPS or localhost, so a plain http://192.168.x.x page records every punch as unverified.
  server: { port: 5173, host: true },
  preview: { port: 5173, host: true },
  build: {
    chunkSizeWarningLimit: 1600,
  },
});
