import { createClient } from '@supabase/supabase-js'

const isLocalhost = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const directConnect = import.meta.env.VITE_SUPABASE_DIRECT_CONNECT === 'true';

// Architecture:
// - Local development: Proxied through Vite dev server (/supabase-api) to avoid CORS/ISP DNS issues,
//   unless VITE_SUPABASE_DIRECT_CONNECT=true is explicitly set.
// - Production (Vercel / deployed custom domain): Direct connection to VITE_SUPABASE_URL.
const supabaseUrl = (isLocalhost && !directConnect)
  ? `${window.location.origin}/supabase-api`
  : (import.meta.env.VITE_SUPABASE_URL || '');

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
