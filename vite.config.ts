import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import dns from 'node:dns';

/**
 * CRITICAL: Supabase Same-Origin Proxy & Custom DNS Lookup
 * This proxy and DNS lookup workaround resolves ISP-level DNS/routing failures reaching *.supabase.co directly (e.g. Jio/Airtel edge DNS degradation in India).
 * DO NOT remove or "simplify" this proxy or the matching vercel.json rewrite without verifying that the underlying network/DNS resolution issue is resolved.
 */
const reliableSupabaseLookup = (hostname: string, options: any, callback: any) => {
  if (hostname === 'bzjzgykbfqfbbqibxexw.supabase.co') {
    // Force the connection to Cloudflare's stable global IP instead of broken ISP edge IP
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
          ws: true, // Enable WebSockets proxy for Realtime
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
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@supabase') || id.includes('supabase')) {
                return 'vendor-supabase';
              }
              return 'vendor';
            }
          }
        }
      }
    }
  };
});
