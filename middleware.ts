import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  // Get the pathname
  const path = request.nextUrl.pathname

  // Define public paths that don't require authentication
  const isPublicPath = path === "/login"

  // Check if user is authenticated
  const authToken = request.cookies.get("auth_token")?.value
  const authExpiry = request.cookies.get("auth_expiry")?.value

  const isAuthenticated = !!authToken

  // Check if token is expired
  let isExpired = false
  if (authExpiry) {
    const expiryDate = new Date(authExpiry)
    isExpired = expiryDate < new Date()
  }

  // Redirect logic
  if (isPublicPath && isAuthenticated && !isExpired) {
    // If user is on a public path but is authenticated, redirect to dashboard
    return NextResponse.redirect(new URL("/", request.url))
  }

  // Disable middleware for now to prevent redirect loops
  // if (!isPublicPath && (!isAuthenticated || isExpired)) {
  //   // If user is on a protected path but is not authenticated or token is expired, redirect to login
  //   return NextResponse.redirect(new URL("/login", request.url))
  // }

  return NextResponse.next()
}

// Configure the middleware to run on specific paths
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
