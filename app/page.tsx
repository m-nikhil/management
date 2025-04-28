"use client"
import { useState, useEffect } from "react"
import { CalendarWithTasks } from "@/components/calendar-with-tasks"
import { useAuth } from "@/components/auth-provider"

export default function Home() {
  const { isAuthenticated } = useAuth()
  const [isClient, setIsClient] = useState(false)

  // Use this to ensure we're rendering on the client
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Don't render anything until we confirm we're on the client
  if (!isClient) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  // Only render the calendar if authenticated
  if (!isAuthenticated) {
    return null
  }

  return (
    <main className="container mx-auto py-6">
      <CalendarWithTasks />
    </main>
  )
}
