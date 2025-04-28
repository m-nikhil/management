"use client"

import bcrypt from "bcryptjs"
import { supabase } from "@/lib/supabase"

// Rate limiting map to prevent brute force attacks
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>()

// Maximum login attempts before timeout
const MAX_ATTEMPTS = 5
// Timeout duration in milliseconds (15 minutes)
const TIMEOUT_DURATION = 15 * 60 * 1000

export async function verifyPasscode(passcode: string, rememberMe: boolean, ipAddress = "unknown") {
  try {
    // Check if the IP is currently rate limited
    const now = Date.now()
    const attempts = loginAttempts.get(ipAddress)

    if (attempts) {
      // If timeout period has passed, reset attempts
      if (now - attempts.lastAttempt > TIMEOUT_DURATION) {
        loginAttempts.set(ipAddress, { count: 1, lastAttempt: now })
      }
      // If too many attempts within timeout period, block the request
      else if (attempts.count >= MAX_ATTEMPTS) {
        const minutesLeft = Math.ceil((TIMEOUT_DURATION - (now - attempts.lastAttempt)) / 60000)
        return {
          success: false,
          error: `Too many failed attempts. Please try again in ${minutesLeft} minutes.`,
          rateLimited: true,
        }
      }
      // Otherwise increment the attempt counter
      else {
        loginAttempts.set(ipAddress, { count: attempts.count + 1, lastAttempt: now })
      }
    } else {
      // First attempt from this IP
      loginAttempts.set(ipAddress, { count: 1, lastAttempt: now })
    }

    // Fetch the stored hash from the database
    const { data, error: fetchError } = await supabase.from("auth_settings").select("passcode_hash").single()

    if (fetchError || !data) {
      console.error("Error fetching auth settings:", fetchError)
      return { success: false, error: "Authentication error. Please try again." }
    }

    // Compare the entered passcode with the stored hash
    const isMatch = await bcrypt.compare(passcode, data.passcode_hash)

    if (isMatch) {
      // Reset login attempts on successful login
      loginAttempts.delete(ipAddress)

      // For client-side, we'll use localStorage instead of cookies
      const expiryDate = new Date()
      if (rememberMe) {
        // Set expiry to 30 days if remember me is checked
        expiryDate.setDate(expiryDate.getDate() + 30)
      } else {
        // Set expiry to 24 hours by default
        expiryDate.setHours(expiryDate.getHours() + 24)
      }

      // Create a secure authentication token
      const authToken = await bcrypt.hash(`${ipAddress}-${now}-${Math.random()}`, 10)

      // Store in localStorage
      localStorage.setItem("auth_token", authToken)
      localStorage.setItem("auth_expiry", expiryDate.toISOString())

      return { success: true }
    } else {
      return { success: false, error: "Invalid passcode" }
    }
  } catch (err) {
    console.error("Login error:", err)
    return { success: false, error: "Authentication error. Please try again." }
  }
}

export async function logout() {
  // Clear authentication from localStorage
  localStorage.removeItem("auth_token")
  localStorage.removeItem("auth_expiry")
  return { success: true }
}

export async function checkAuth() {
  // Check if auth_token exists in localStorage
  const authToken = localStorage.getItem("auth_token")

  if (!authToken) {
    return { authenticated: false }
  }

  // Check if token is expired
  const authExpiry = localStorage.getItem("auth_expiry")

  if (authExpiry) {
    const expiryDate = new Date(authExpiry)
    if (expiryDate < new Date()) {
      // Token is expired, clear localStorage
      localStorage.removeItem("auth_token")
      localStorage.removeItem("auth_expiry")
      return { authenticated: false }
    }
  }

  return { authenticated: true }
}
