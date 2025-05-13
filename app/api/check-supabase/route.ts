import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Check if environment variables are set
  const envStatus = {
    NEXT_PUBLIC_SUPABASE_URL: !!supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!supabaseKey,
  }

  // Try to create a client
  const supabase = createServerSupabaseClient()

  // Try to make a simple query if client exists
  let queryResult = null
  if (supabase) {
    try {
      const { data, error } = await supabase.from("auth_settings").select("*").limit(1)
      queryResult = {
        success: !error,
        data: data ? "Data retrieved successfully" : "No data found",
        error: error ? error.message : null,
      }
    } catch (e) {
      queryResult = { success: false, error: e instanceof Error ? e.message : "Unknown error" }
    }
  }

  return NextResponse.json({
    environmentVariables: envStatus,
    clientInitialized: !!supabase,
    queryTest: queryResult,
    message: supabase
      ? "Supabase client initialized successfully"
      : "Failed to initialize Supabase client. Please check your environment variables.",
  })
}
