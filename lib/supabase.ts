import { createClient } from "@supabase/supabase-js"

// Create a singleton supabase client
let _supabase: ReturnType<typeof createClient> | null = null

try {
  // Check if we're in a browser environment
  if (typeof window !== "undefined") {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // Only initialize if both URL and key are available
    if (supabaseUrl && supabaseAnonKey) {
      _supabase = createClient(supabaseUrl, supabaseAnonKey)
      console.log("Supabase client initialized successfully")
    } else {
      console.error("Missing Supabase environment variables")
    }
  } else {
    console.log("Not in browser environment, skipping Supabase initialization")
  }
} catch (error) {
  console.error("Error initializing Supabase client:", error)
  _supabase = null
}

import { getSupabaseClient } from "./supabase-client"

// Re-export for backward compatibility
export const supabase = getSupabaseClient()
