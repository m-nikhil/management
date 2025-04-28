"use client"
import { useState, useEffect } from "react"
import type React from "react"

import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { AlertCircle, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { verifyPasscode } from "../actions/auth-actions"

export default function LoginPage() {
  const [passcode, setPasscode] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const router = useRouter()

  // Check if already logged in
  useEffect(() => {
    try {
      const isAuthenticated = localStorage.getItem("isAuthenticated")
      const authExpiry = localStorage.getItem("authExpiry")

      if (isAuthenticated === "true" && authExpiry) {
        const expiryDate = new Date(authExpiry)
        if (expiryDate > new Date()) {
          router.push("/")
        } else {
          // Clear expired authentication
          localStorage.removeItem("isAuthenticated")
          localStorage.removeItem("authExpiry")
        }
      }
    } catch (error) {
      console.error("Error checking authentication on login page:", error)
      // Clear any potentially corrupted auth data
      localStorage.removeItem("isAuthenticated")
      localStorage.removeItem("authExpiry")
    }
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      // Simple validation
      if (!passcode) {
        setError("Passcode is required")
        setIsLoading(false)
        return
      }

      console.log("Attempting login with passcode")

      // Verify passcode against database
      const result = await verifyPasscode(passcode, "user-ip")

      if (result.success) {
        console.log("Passcode match successful")

        // Set authentication in localStorage
        localStorage.setItem("isAuthenticated", "true")

        // If remember me is checked, set expiry to 30 days from now
        if (rememberMe) {
          const expiryDate = new Date()
          expiryDate.setDate(expiryDate.getDate() + 30)
          localStorage.setItem("authExpiry", expiryDate.toISOString())
        } else {
          // Otherwise, set expiry to end of browser session (24 hours)
          const expiryDate = new Date()
          expiryDate.setHours(expiryDate.getHours() + 24)
          localStorage.setItem("authExpiry", expiryDate.toISOString())
        }

        // Add a small delay to ensure localStorage is updated
        setTimeout(() => {
          // Redirect to home page
          router.push("/")
        }, 100)
      } else {
        console.log("Passcode match failed")
        setError(result.error || "Invalid passcode")
        setIsLoading(false)
      }
    } catch (error) {
      console.error("Login error:", error)
      setError("An unexpected error occurred. Please try again.")
      setIsLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Flault Lab Management</CardTitle>
          <CardDescription className="text-center">
            Enter your passcode to access the task management system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin}>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="passcode">Passcode</Label>
                <Input
                  id="passcode"
                  type="password"
                  placeholder="Enter your passcode"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rememberMe"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                <Label htmlFor="rememberMe" className="text-sm font-normal">
                  Remember me for 30 days
                </Label>
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter>
          <Button className="w-full bg-blue-500 hover:bg-blue-600" onClick={handleLogin} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Logging in...
              </>
            ) : (
              "Login"
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
