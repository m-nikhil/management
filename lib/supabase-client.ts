import { createClient } from "@supabase/supabase-js"

// Create a singleton supabase client
let supabase: ReturnType<typeof createClient> | null = null

// Function to get or create the Supabase client
export function getSupabaseClient() {
  // If we already have a client, return it
  if (supabase) return supabase

  try {
    // Check if we're in a browser environment
    if (typeof window !== "undefined") {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      // Only initialize if both URL and key are available
      if (supabaseUrl && supabaseAnonKey) {
        supabase = createClient(supabaseUrl, supabaseAnonKey)
        console.log("Supabase client initialized successfully")
      } else {
        // In development, provide a more helpful message
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "Missing Supabase environment variables. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file.",
          )
        } else {
          console.error("Missing Supabase environment variables")
        }
        return null
      }
    } else {
      console.log("Not in browser environment, skipping client-side Supabase initialization")
      return null
    }
  } catch (error) {
    console.error("Error initializing Supabase client:", error)
    return null
  }

  return supabase
}

// For backward compatibility
export { supabase }
