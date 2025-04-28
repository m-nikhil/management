"use client"
import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"

interface AuthContextType {
  isAuthenticated: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  logout: () => {},
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Check authentication status from localStorage
    const checkAuth = () => {
      try {
        const authStatus = localStorage.getItem("isAuthenticated")
        const authExpiry = localStorage.getItem("authExpiry")

        let isValid = authStatus === "true"

        // If there's an expiry date, check if it's still valid
        if (isValid && authExpiry) {
          const expiryDate = new Date(authExpiry)
          isValid = expiryDate > new Date()

          // Clear expired authentication
          if (!isValid) {
            localStorage.removeItem("isAuthenticated")
            localStorage.removeItem("authExpiry")
          }
        }

        setIsAuthenticated(isValid)
        setIsLoading(false)

        // Redirect to login if not authenticated and not already on login page
        if (!isValid && pathname !== "/login") {
          router.push("/login")
        }
      } catch (error) {
        console.error("Error checking authentication:", error)
        setIsAuthenticated(false)
        setIsLoading(false)

        // Redirect to login on error
        if (pathname !== "/login") {
          router.push("/login")
        }
      }
    }

    checkAuth()
  }, [pathname, router])

  const logout = () => {
    try {
      localStorage.removeItem("isAuthenticated")
      localStorage.removeItem("authExpiry")
      setIsAuthenticated(false)
      router.push("/login")
    } catch (error) {
      console.error("Error during logout:", error)
      // Force reload as a fallback
      window.location.href = "/login"
    }
  }

  // Show nothing while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return <AuthContext.Provider value={{ isAuthenticated, logout }}>{children}</AuthContext.Provider>
}
