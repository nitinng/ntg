import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: {
        overlay: false, // Disable error overlay that can cause reloads
        timeout: 60000, // Increase WebSocket timeout to 60 seconds
      },
      watch: {
        // Use polling to prevent issues with file watchers
        usePolling: false,
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    // Optimize dependencies to prevent re-bundling
    optimizeDeps: {
      include: ['react', 'react-dom'],
    },
  };
});
