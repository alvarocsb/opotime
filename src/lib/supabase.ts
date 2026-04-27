import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Cliente público: usa la anon key, respeta RLS. Seguro para Client Components.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cliente admin: usa la service_role key, bypassa RLS. Solo usar en API routes (servidor).
// NUNCA importar en un archivo con 'use client'.
export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
