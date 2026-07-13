import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import dns from 'node:dns';

// Custom DNS lookup to bypass broken ISP-assigned IP for Supabase
const reliableSupabaseLookup = (hostname: string, options: any, callback: any) => {
  if (hostname === 'bzjzgykbfqfbbqibxexw.supabase.co') {
    // Force the connection to Cloudflare's stable global IP instead of the broken ISP edge (49.44.x.x)
    return callback(null, '104.18.38.10', 4);
  }
  return dns.lookup(hostname, options, callback);
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/supabase-api': {
          target: 'https://bzjzgykbfqfbbqibxexw.supabase.co',
          changeOrigin: true,
          secure: true,
          // @ts-ignore - lookup is supported by node-http-proxy
          lookup: reliableSupabaseLookup,
          rewrite: (path) => path.replace(/^\/supabase-api/, ''),
        },
      },
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
