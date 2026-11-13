import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api/upcitemdb': { target: 'https://api.upcitemdb.com', changeOrigin: true, rewrite: path => path.replace(/^\/api\/upcitemdb/, '/prod/trial') } } },
});
