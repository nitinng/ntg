import { createClient } from '@supabase/supabase-js'

const supabaseUrl = `${window.location.origin}/supabase-api`;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables. Check your .env file.')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
