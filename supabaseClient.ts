import { createClient } from '@supabase/supabase-js'

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const supabaseUrl = isLocalhost 
  ? `${window.location.origin}/supabase-api` 
  : import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables. Check your .env file.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
