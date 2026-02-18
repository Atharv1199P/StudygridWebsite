import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/groq': {
        target: 'https://api.groq.com/openai/v1',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/groq/, ''),
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['set-cookie']) {
              delete proxyRes.headers['set-cookie'];
            }
          });
        },
      },
    },
  },
}) 
