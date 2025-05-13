import { createClient } from "@supabase/supabase-js"

// Create a server-side Supabase client (for use in Server Components, API routes, etc.)
export function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.warn("Server: Missing Supabase environment variables. Using mock data.")
    return null
  }

  return createClient(supabaseUrl, supabaseKey)
}
