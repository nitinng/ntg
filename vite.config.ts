import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import dns from 'node:dns';

// Prioritize IPv4 over IPv6 in Node DNS lookups to prevent dual-stack resolution hangs
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore in environments where setDefaultResultOrder is not supported
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const supabaseTarget = env.VITE_SUPABASE_URL || 'https://bzjzgykbfqfbbqibxexw.supabase.co';
  let supabaseHostname = '';
  try {
    supabaseHostname = new URL(supabaseTarget).hostname;
  } catch {
    supabaseHostname = 'bzjzgykbfqfbbqibxexw.supabase.co';
  }

  // Optional manual IP override for restricted network environments (via SUPABASE_PINNED_IP env var)
  const pinnedIp = env.SUPABASE_PINNED_IP || process.env.SUPABASE_PINNED_IP;
  const customDnsLookup = pinnedIp
    ? (hostname: string, options: any, callback: any) => {
        if (hostname === supabaseHostname) {
          return callback(null, pinnedIp, 4);
        }
        return dns.lookup(hostname, options, callback);
      }
    : undefined;

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/supabase-api': {
          target: supabaseTarget,
          changeOrigin: true,
          secure: true,
          ws: true, // Enable WebSockets proxy for Realtime
          ...(customDnsLookup ? { lookup: customDnsLookup } : {}),
          rewrite: (path) => path.replace(/^\/supabase-api/, ''),
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, _req, _res) => {
              proxyReq.removeHeader('cookie');
            });
            proxy.on('proxyReqWs', (proxyReq, _req, _socket, _options, _head) => {
              proxyReq.removeHeader('cookie');
            });
          }
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
