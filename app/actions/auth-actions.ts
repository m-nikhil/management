"use client"

import { supabase } from "@/lib/supabase"

export async function verifyPasscode(passcode: string, ipAddress = "unknown") {
  console.log("Verifying passcode")

  try {
    // Check if supabase client is available
    if (!supabase) {
      console.error("Supabase client is not initialized")
      return {
        success: false,
        error: "Authentication service unavailable. Please try again later.",
      }
    }

    // Fetch the stored passcode_hash from the database
    const { data, error } = await supabase.from("auth_settings").select("passcode_hash").single()

    if (error) {
      console.error("Error fetching passcode_hash from database:", error)
      return {
        success: false,
        error: "Authentication service unavailable. Please try again later.",
      }
    }

    if (!data || !data.passcode_hash) {
      console.error("No passcode_hash found in database")
      return {
        success: false,
        error: "Authentication not configured. Please contact an administrator.",
      }
    }

    // Simple direct comparison
    const isMatch = passcode === data.passcode_hash

    if (isMatch) {
      return { success: true }
    }

    return { success: false, error: "Invalid passcode" }
  } catch (err) {
    console.error("Login error:", err)
    return {
      success: false,
      error: "Authentication error. Please try again.",
    }
  }
}
