"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import { OrdersTable } from "@/components/orders-table"
import type { Task } from "@/components/calendar-with-tasks"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/ui/use-toast"
import { addDays, parseISO, isAfter, isBefore, isEqual } from "date-fns"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { taskColors, statusOptions } from "@/lib/constants"

// Update the fetchHolidays function and pass holidays to OrdersTable
// Add this after the existing imports
import { getActiveAndFutureHolidays } from "@/app/actions/holiday-actions"
import type { Holiday } from "@/app/actions/holiday-actions"

export default function UpcomingTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [upcomingStartTasks, setUpcomingStartTasks] = useState<Task[]>([])
  const [upcomingEndTasks, setUpcomingEndTasks] = useState<Task[]>([])
  const [upcomingDueTasks, setUpcomingDueTasks] = useState<Task[]>([])
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { toast } = useToast()
  const [hideCompleted, setHideCompleted] = useState(false)

  // Add this state variable with the other state declarations
  const [holidays, setHolidays] = useState<Holiday[]>([])

  // Use refs to track previous state to prevent unnecessary updates
  const prevTasksRef = useRef<Task[]>([])
  const isInitialMount = useRef(true)
  const isUpdatingRef = useRef(false)

  const toggleHideCompleted = () => {
    setHideCompleted(!hideCompleted)
  }

  // Filter tasks into upcoming start dates, end dates, due dates, and overdue categories
  const filterTasks = useCallback(
    (allTasks: Task[]) => {
      // Skip if we're already updating to prevent loops
      if (isUpdatingRef.current) return

      const today = new Date()
      today.setHours(0, 0, 0, 0) // Set to beginning of day

      const sevenDaysLater = addDays(today, 7)
      sevenDaysLater.setHours(23, 59, 59, 999) // Set to end of day

      // Apply hideCompleted filter to all tasks first
      const visibleTasks = hideCompleted ? allTasks.filter((task) => task.status !== "Completed") : allTasks

      // Filter for tasks starting in the next 7 days (including today)
      const startingTasks = visibleTasks.filter((task) => {
        // Check if start date is within range (today to 7 days from now)
        const startDate = parseISO(task.startDate)
        return (
          (isEqual(startDate, today) || isAfter(startDate, today)) && // Starting today or later
          (isBefore(startDate, sevenDaysLater) || isEqual(startDate, sevenDaysLater)) // Within 7 days
        )
      })

      // Filter for tasks ending in the next 7 days (including today)
      const endingTasks = visibleTasks.filter((task) => {
        // Check if end date is within range (today to 7 days from now)
        const endDate = parseISO(task.endDate)
        return (
          (isEqual(endDate, today) || isAfter(endDate, today)) && // Ending today or later
          (isBefore(endDate, sevenDaysLater) || isEqual(endDate, sevenDaysLater)) // Within 7 days
        )
      })

      // Filter for upcoming tasks (due in next 7 days, not overdue)
      const upcomingDue = visibleTasks.filter((task) => {
        // Check if due date is within range (today to 7 days from now)
        const dueDate = parseISO(task.dueDate)
        return (
          !isBefore(dueDate, today) && // Not overdue
          (isEqual(dueDate, today) || isAfter(dueDate, today)) && // Due today or later
          (isBefore(dueDate, sevenDaysLater) || isEqual(dueDate, sevenDaysLater)) // Within 7 days
        )
      })

      // Filter for overdue tasks (due before today) - always exclude completed tasks
      const overdue = visibleTasks.filter((task) => {
        // Check if due date is before today and task is not completed
        const endDate = parseISO(task.endDate)
        return isBefore(endDate, today) && task.status !== "Completed"
      })

      // Set updating flag to prevent loops
      isUpdatingRef.current = true

      setUpcomingStartTasks(startingTasks)
      setUpcomingEndTasks(endingTasks)
      setUpcomingDueTasks(upcomingDue)
      setOverdueTasks(overdue)

      // Reset updating flag after state updates
      setTimeout(() => {
        isUpdatingRef.current = false
      }, 0)
    },
    [hideCompleted],
  ) // Add hideCompleted to dependencies

  // Load tasks from Supabase on component mount
  useEffect(() => {
    fetchTasks()
    fetchHolidays()

    // Set up event listeners for task updates
    const handleTaskCreated = () => {
      console.log("Task created event received in upcoming page, refreshing tasks")
      fetchTasks()
    }

    const handleTasksUpdated = () => {
      console.log("Tasks updated event received in upcoming page, refreshing tasks")
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty dependency array ensures this only runs once on mount

  // Add this function after fetchTasks
  const fetchHolidays = async () => {
    try {
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
    }
  }

  const fetchTasks = async () => {
    try {
      setIsLoading(true)
      setIsRefreshing(true)
      console.log("Fetching tasks from database in upcoming page...")
      const { data, error } = await supabase.from("tasks").select("*").order("start_date", { ascending: true })

      if (error) {
        console.error("Error fetching tasks:", error)
        toast({
          title: "Database Error",
          description: "Failed to fetch tasks from database.",
          variant: "destructive",
        })
        setIsLoading(false)
        setIsRefreshing(false)
        return
      }

      // Clear existing tasks first to ensure deleted tasks are removed
      setTasks([])
      setUpcomingStartTasks([])
      setUpcomingEndTasks([])
      setUpcomingDueTasks([])
      setOverdueTasks([])

      if (data && data.length > 0) {
        console.log(`Fetched ${data.length} tasks from database in upcoming page`)
        // Transform the data to match our Task type
        const transformedTasks = data.map((task: any) => ({
          id: task.id,
          orderNumber: task.order_number || "",
          orderName: task.order_name || "",
          startDate: task.start_date || new Date().toISOString().split("T")[0],
          endDate: task.end_date || new Date().toISOString().split("T")[0],
          dueDate: task.due_date || new Date().toISOString().split("T")[0],
          notes: task.notes || "",
          color: task.color || taskColors[0],
          effort: task.effort || 0,
          row: task.row || 0,
          customerName: task.customer_name || "",
          phoneNumber: task.phone_number || "",
          status: task.status || statusOptions[0],
          daysToComplete: task.days_to_complete,
          numberOfHolidays: task.number_of_holidays,
          holidayDates: task.holiday_dates || [],
        }))

        // Always update the tasks state with the new data
        setTasks(transformedTasks)

        // Force re-filtering of tasks
        filterTasks(transformedTasks)

        // Update the ref to prevent unnecessary updates
        prevTasksRef.current = transformedTasks
      } else {
        console.log("No tasks found in database in upcoming page")
        prevTasksRef.current = []
      }

      setIsLoading(false)
      setIsRefreshing(false)
    } catch (error) {
      console.error("Error loading tasks from Supabase in upcoming page:", error)
      toast({
        title: "Database Error",
        description: "Failed to connect to database.",
        variant: "destructive",
      })
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  // Apply filterTasks whenever tasks change, but not on initial mount
  useEffect(() => {
    // Skip on initial mount as we handle it in fetchTasks
    if (isInitialMount.current) return

    // Skip if tasks are empty
    if (tasks.length === 0) return

    // Skip if tasks haven't changed
    if (JSON.stringify(tasks) === JSON.stringify(prevTasksRef.current)) return

    // Update our ref and filter tasks
    prevTasksRef.current = tasks
    filterTasks(tasks)
  }, [tasks, filterTasks, hideCompleted]) // Add hideCompleted to dependencies

  // Update tasks in all lists when a task is modified
  const handleTasksUpdate = useCallback((updatedTasks: Task[], sourceType: "start" | "end" | "due" | "overdue") => {
    // Skip if we're already updating
    if (isUpdatingRef.current) return

    // Find the tasks that were updated
    const updatedIds = new Set(updatedTasks.map((t) => t.id))

    // Update the main tasks list by replacing only the updated tasks
    setTasks((prevTasks) => {
      // Check if any tasks actually changed to avoid unnecessary updates
      const hasChanges = updatedTasks.some((updatedTask) => {
        const prevTask = prevTasks.find((t) => t.id === updatedTask.id)
        return !prevTask || JSON.stringify(prevTask) !== JSON.stringify(updatedTask)
      })

      if (!hasChanges) return prevTasks

      // Remove the updated tasks from the previous tasks
      const remainingTasks = prevTasks.filter((task) => !updatedIds.has(task.id))
      // Add the updated tasks
      const newTasks = [...remainingTasks, ...updatedTasks]

      // Update our ref to prevent unnecessary filtering
      prevTasksRef.current = newTasks
      return newTasks
    })
  }, [])

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Upcoming Tasks</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchTasks} className="flex items-center gap-1" disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Upcoming Start Dates Section */}
      <div className="mb-4 bg-purple-50 border-l-4 border-purple-500 p-2 rounded">
        <p className="text-sm font-medium text-purple-700">Upcoming Start Dates (Next 7 Days)</p>
      </div>

      <div className="mb-8">
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
            <span className="ml-3 text-gray-500">Loading tasks...</span>
          </div>
        ) : (
          <>
            {upcomingStartTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-500">No tasks starting in the next 7 days</p>
              </div>
            ) : (
              <OrdersTable
                tasks={upcomingStartTasks}
                hideExcelDownload={true}
                setTasks={(updatedTasks) => handleTasksUpdate(updatedTasks, "start")}
                holidays={holidays}
              />
            )}
          </>
        )}
      </div>

      {/* Upcoming End Dates Section */}
      <div className="mb-4 bg-green-50 border-l-4 border-green-500 p-2 rounded">
        <p className="text-sm font-medium text-green-700">Upcoming End Dates (Next 7 Days)</p>
      </div>

      <div className="mb-8">
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
            <span className="ml-3 text-gray-500">Loading tasks...</span>
          </div>
        ) : (
          <>
            {upcomingEndTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-500">No tasks ending in the next 7 days</p>
              </div>
            ) : (
              <OrdersTable
                tasks={upcomingEndTasks}
                hideExcelDownload={true}
                setTasks={(updatedTasks) => handleTasksUpdate(updatedTasks, "end")}
                holidays={holidays}
              />
            )}
          </>
        )}
      </div>

      {/* Upcoming Due Dates Section */}
      <div className="mb-4 bg-blue-50 border-l-4 border-blue-500 p-2 rounded">
        <p className="text-sm font-medium text-blue-700">Upcoming Due Dates (Next 7 Days)</p>
      </div>

      <div className="mb-8">
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-gray-500">Loading tasks...</span>
          </div>
        ) : (
          <>
            {upcomingDueTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-500">No tasks due in the next 7 days</p>
              </div>
            ) : (
              <OrdersTable
                tasks={upcomingDueTasks}
                hideExcelDownload={true}
                setTasks={(updatedTasks) => handleTasksUpdate(updatedTasks, "due")}
                holidays={holidays}
              />
            )}
          </>
        )}
      </div>

      {/* Overdue Tasks Section */}
      <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-2 rounded">
        <p className="text-sm font-medium text-red-700">Overdue Tasks</p>
      </div>

      <div>
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
            <span className="ml-3 text-gray-500">Loading tasks...</span>
          </div>
        ) : (
          <>
            {overdueTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-500">No overdue tasks</p>
              </div>
            ) : (
              <OrdersTable
                tasks={overdueTasks}
                hideExcelDownload={true}
                hideCompletedToggle={true}
                setTasks={(updatedTasks) => handleTasksUpdate(updatedTasks, "overdue")}
                holidays={holidays}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
