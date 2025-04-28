"use client"
import { useState, useEffect } from "react"
import { OrdersTable } from "@/components/orders-table"
import type { Task } from "@/components/calendar-with-tasks"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/ui/use-toast"
import { getActiveAndFutureHolidays } from "@/app/actions/holiday-actions"
import type { Holiday } from "@/app/actions/holiday-actions"

// Add global styles for calendar in orders page

export default function OrdersPage() {
  // Add this useEffect at the beginning of the component
  useEffect(() => {
    // Add a class to the body when on orders page
    document.body.classList.add("orders-page")

    // Clean up when component unmounts
    return () => {
      document.body.classList.remove("orders-page")
    }
  }, [])

  const [tasks, setTasks] = useState<Task[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  // Load tasks from Supabase on component mount
  useEffect(() => {
    fetchTasks()
    fetchHolidays()

    // Set up event listeners for task updates
    const handleTaskCreated = () => {
      console.log("Task created event received in orders page, refreshing tasks")
      fetchTasks()
    }

    const handleTasksUpdated = () => {
      console.log("Tasks updated event received in orders page, refreshing tasks")
      fetchTasks()
    }

    // Add event listeners
    window.addEventListener("task-created", handleTaskCreated)
    window.addEventListener("tasks-updated", handleTasksUpdated)

    // Clean up event listeners on unmount
    return () => {
      window.removeEventListener("task-created", handleTaskCreated)
      window.removeEventListener("tasks-updated", handleTasksUpdated)
    }
  }, []) // Empty dependency array ensures this only runs once on mount

  const fetchHolidays = async () => {
    try {
      setIsLoading(true)
      console.log("Fetching holidays from database...")

      // Use the function to get only active and future holidays
      const { data, error, success } = await getActiveAndFutureHolidays()

      if (!success || error) {
        console.error("Error fetching holidays:", error)
        toast({
          title: "Error",
          description: "Failed to fetch holidays from database.",
          variant: "destructive",
        })
        return
      }

      if (data) {
        console.log(`Fetched ${data.length} active and future holidays`)
        setHolidays(data)
      } else {
        console.log("No holidays found in database")
        setHolidays([])
      }
    } catch (error) {
      console.error("Error loading holidays from Supabase:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred while fetching holidays.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const fetchTasks = async () => {
    try {
      setIsLoading(true)
      console.log("Fetching tasks from database...")

      // Check if supabase client is available
      if (!supabase) {
        console.error("Supabase client is not initialized")
        setIsLoading(false)
        toast({
          title: "Database Error",
          description: "Database connection not available.",
          variant: "destructive",
        })
        return
      }

      const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false })

      if (error) {
        console.error("Error fetching tasks:", error)
        toast({
          title: "Database Error",
          description: "Failed to fetch tasks from database.",
          variant: "destructive",
        })
        setIsLoading(false)
        return
      }

      if (data && data.length > 0) {
        console.log(`Fetched ${data.length} tasks from database`)
        // Transform the data to match our Task type
        const transformedTasks = data.map((task) => ({
          id: task.id,
          orderNumber: task.order_number,
          orderName: task.order_name,
          startDate: task.start_date,
          endDate: task.end_date,
          dueDate: task.due_date,
          notes: task.notes || "",
          color: task.color,
          effort: task.effort,
          row: task.row,
          customerName: task.customer_name || "",
          phoneNumber: task.phone_number || "",
          status: task.status,
          daysToComplete: task.days_to_complete,
          numberOfHolidays: task.number_of_holidays,
          holidayDates: task.holiday_dates,
        }))

        setTasks(transformedTasks)
      } else {
        // If no data, set empty array
        setTasks([])
      }
      setIsLoading(false)
    } catch (error) {
      console.error("Error loading tasks from Supabase:", error)
      toast({
        title: "Database Error",
        description: "Failed to connect to database.",
        variant: "destructive",
      })
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-6">
      <div className="h-[calc(100vh-150px)]">
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-gray-500">Loading orders...</span>
          </div>
        ) : (
          <OrdersTable tasks={tasks} setTasks={setTasks} holidays={holidays} />
        )}
      </div>
    </div>
  )
}
