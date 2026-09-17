import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const cle = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !cle) throw new Error('Configuration Supabase absente (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).')
  client = createClient(url, cle)
  return client
}
