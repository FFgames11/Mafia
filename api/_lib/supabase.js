import { createClient } from '@supabase/supabase-js'

let supabase = null

export function getSupabase(req) {
  if (supabase) {
    return supabase
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    getHeader(req, 'x-supabase-url')
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    getHeader(req, 'x-supabase-anon-key')

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables for API routes.')
  }

  supabase = createClient(supabaseUrl, supabaseKey)
  return supabase
}

function getHeader(req, name) {
  const value = req?.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}
