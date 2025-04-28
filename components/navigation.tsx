"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Calendar, List, LayoutGrid, Plus, History, LogOut, Clock, CalendarOff } from "lucide-react"
import { format, parseISO } from "date-fns"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { TaskPanel } from "@/components/task-panel"
import type { Task } from "@/components/calendar-with-tasks"
import { createLogEntry, saveLog } from "@/utils/history-logger"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"

export function Navigation() {
  const pathname = usePathname()
  const [isNewTaskPanelOpen, setIsNewTaskPanelOpen] = useState(false)
  const [newTask, setNewTask] = useState<Task | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [nextId, setNextId] = useState(12)
  const [nextRow, setNextRow] = useState(11)
  const { isAuthenticated, logout } = useAuth()
  const [renderNavigation, setRenderNavigation] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Add refs to track state between renders
  const isInitializingTask = useRef(false)
  const holidays = useRef<any[]>([])

  // Determine whether to render navigation based on authentication and pathname
  useEffect(() => {
    if (pathname !== "/login" && isAuthenticated) {
      setRenderNavigation(true)
    } else {
      setRenderNavigation(false)
    }
    setIsLoading(false)
  }, [pathname, isAuthenticated])

  // Load tasks from Supabase on component mount
  useEffect(() => {
    // Only try to fetch tasks if authenticated
    if (isAuthenticated) {
      // Add a small delay to ensure authentication is fully processed
      const timer = setTimeout(() => {
        fetchTasks().catch((err) => {
          console.error("Error in fetchTasks effect:", err)
        })
      }, 500)

      return () => clearTimeout(timer)
    }
  }, [isAuthenticated])

  // Fetch holidays when the component mounts
  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        if (!supabase) return
        const { data, error } = await supabase.from("holidays").select("*").eq("cancelled", false)

        if (error) {
          console.error("Error fetching holidays:", error)
          return
        }

        if (data) {
          holidays.current = data
          console.log(`Loaded ${data.length} holidays for task creation`)
        }
      } catch (error) {
        console.error("Error loading holidays:", error)
      }
    }

    fetchHolidays()
  }, [])

  // Update the fetchTasks function to handle fetch errors gracefully
  const fetchTasks = async () => {
    try {
      // Check if we're authenticated before trying to fetch
      if (!isAuthenticated) {
        return
      }

      // Check if supabase client is available
      if (!supabase) {
        console.error("Supabase client is not initialized")
        return
      }

      // Add a timeout to the fetch operation
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Database request timed out")), 5000)
      })

      // Try to fetch tasks from Supabase with a timeout
      try {
        const { data, error } = (await Promise.race([
          supabase.from("tasks").select("*").order("created_at", { ascending: false }),
          timeoutPromise,
        ])) as any

        if (error) {
          console.error("Error fetching tasks:", error)
          return
        }

        if (data && data.length > 0) {
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

          // Find the maximum task ID
          const maxId = Math.max(...transformedTasks.map((task) => task.id))
          setNextId(maxId + 1)

          // Find the maximum row
          const maxRow = Math.max(
            ...transformedTasks.filter((task) => task.row !== undefined).map((task) => task.row || 0),
          )
          setNextRow(maxRow + 1)
        }
      } catch (fetchError) {
        console.error("Fetch operation failed or timed out:", fetchError)
      }
    } catch (error) {
      console.error("Error in fetchTasks:", error)
    }
  }

  // Create a memoized function to initialize a new task
  const initializeNewTask = useCallback(() => {
    // Skip if we're already initializing to prevent loops
    if (isInitializingTask.current) return null

    isInitializingTask.current = true

    try {
      const today = new Date()
      const todayStr = format(today, "yyyy-MM-dd")

      // Generate next order number
      const nextOrderNum = `ORD-${String(tasks.length + 1).padStart(3, "0")}`

      const newTaskTemplate: Task = {
        id: nextId,
        orderNumber: nextOrderNum,
        orderName: "",
        startDate: todayStr,
        endDate: "", // Empty end date
        dueDate: "", // Empty due date
        notes: "",
        color: "bg-blue-500",
        effort: 25,
        row: nextRow,
        customerName: "",
        phoneNumber: "",
        status: "New",
      }

      return newTaskTemplate
    } finally {
      // Reset the flag after a short delay to ensure state updates have completed
      setTimeout(() => {
        isInitializingTask.current = false
      }, 0)
    }
  }, [nextId, nextRow, tasks.length])

  // Handle opening the new task panel
  const handleOpenNewTaskPanel = useCallback(() => {
    const taskTemplate = initializeNewTask()
    if (taskTemplate) {
      setNewTask(taskTemplate)
      setIsNewTaskPanelOpen(true)
    }
  }, [initializeNewTask])

  // Add a function to get holiday dates in range
  const getHolidayDatesInRange = (startDate: Date, endDate: Date, holidays: any[]): string[] => {
    if (!holidays || holidays.length === 0) return []

    const holidayDates: string[] = []
    const currentDate = new Date(startDate)

    // Helper function to check if a date is a holiday
    const isHoliday = (date: Date) => {
      const dateStr = format(date, "yyyy-MM-dd")
      const dayOfWeek = date.getDay() // 0 = Sunday, 1 = Monday, etc.

      return holidays.some((holiday) => {
        if (holiday.holiday_type === "specific_date" && holiday.specific_date) {
          return holiday.specific_date === dateStr
        }

        if (holiday.holiday_type === "day_of_week" && holiday.day_of_week !== null) {
          return holiday.day_of_week === dayOfWeek
        }

        return false
      })
    }

    // Loop through each day in the range
    while (currentDate <= endDate) {
      // Check if this day is a holiday
      if (isHoliday(currentDate)) {
        // Add the date in YYYY-MM-DD format
        holidayDates.push(format(currentDate, "yyyy-MM-dd"))
      }
      // Move to the next day
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return holidayDates
  }

  // Find the createNewTask function and update it to trigger a refresh event
  // This will ensure that other components know when a new task is created

  // Update the createNewTask function to properly handle the holiday_dates field and trigger a refresh
  const createNewTask = async (task: Task) => {
    try {
      // First update the local state for immediate feedback
      const newTask = {
        ...task,
        id: nextId,
      }

      // Add task to tasks array
      const updatedTasks = [...tasks, newTask]
      setTasks(updatedTasks)

      // Try to insert task into Supabase
      try {
        if (supabase) {
          // Calculate holiday dates
          const startDate = parseISO(task.startDate)
          const endDate = parseISO(task.endDate)
          const holidayDates = getHolidayDatesInRange(startDate, endDate, holidays.current)
          console.log("Holiday dates for new task:", holidayDates)

          // Create a base object with only the standard columns that definitely exist
          const baseTaskData = {
            order_number: task.orderNumber,
            order_name: task.orderName,
            start_date: task.startDate,
            end_date: task.endDate,
            due_date: task.dueDate,
            notes: task.notes,
            color: task.color,
            effort: task.effort,
            row: task.row,
            customer_name: task.customerName,
            phone_number: task.phoneNumber,
            status: task.status,
            days_to_complete: task.daysToComplete,
            holiday_dates: holidayDates,
          }

          // Now insert with only the columns that exist
          const { data, error } = await supabase.from("tasks").insert(baseTaskData).select()

          if (error) {
            console.error("Error creating task in database:", error)
            // Continue with local changes only
          } else {
            console.log("Task created successfully in database")

            // Try to save log to Supabase
            try {
              await supabase.from("logs").insert({
                timestamp: new Date().toISOString(),
                action_type: "added",
                task_id: newTask.id,
                order_number: newTask.orderNumber,
                order_name: newTask.orderName,
                details: `New task created with due date: ${format(new Date(newTask.dueDate), "MMM d, yyyy")}`,
                user_name: "User",
              })
            } catch (logError) {
              console.error("Error saving log to database:", logError)
              // Continue even if log saving fails
            }

            // Dispatch a custom event to notify other components about the new task
            window.dispatchEvent(new CustomEvent("task-created", { detail: newTask }))

            // Also dispatch the general tasks-updated event
            window.dispatchEvent(new CustomEvent("tasks-updated"))
          }
        }
      } catch (dbError) {
        console.error("Database operation failed:", dbError)
        // Continue with local changes only
      }

      // Also save to localStorage for backward compatibility
      const logEntry = createLogEntry(
        "added",
        newTask,
        `New task created with due date: ${format(new Date(newTask.dueDate), "MMM d, yyyy")}`,
      )
      saveLog(logEntry)

      setIsNewTaskPanelOpen(false)
      setNewTask(null)
      setNextId(nextId + 1)
      setNextRow(nextRow + 1)
    } catch (error) {
      console.error("Error creating task:", error)
      alert("Task created locally, but there was an issue saving to the database.")
    }
  }

  const navItems = [
    {
      name: "Calendar View",
      href: "/",
      icon: <LayoutGrid className="h-4 w-4 mr-2" />,
    },
    {
      name: "Due Dates",
      href: "/due-dates",
      icon: <Calendar className="h-4 w-4 mr-2" />,
    },
    {
      name: "Orders List",
      href: "/orders",
      icon: <List className="h-4 w-4 mr-2" />,
    },
    {
      name: "Upcoming & Overdue",
      href: "/upcoming",
      icon: <Clock className="h-4 w-4 mr-2" />,
    },
    {
      name: "Holidays",
      href: "/holidays",
      icon: <CalendarOff className="h-4 w-4 mr-2" />,
    },
    {
      name: "History",
      href: "/history",
      icon: <History className="h-4 w-4 mr-2" />,
    },
  ]

  // Show loading indicator while determining whether to render
  if (isLoading) {
    return null
  }

  // Render null if we shouldn't show navigation
  if (!renderNavigation) {
    return null
  }

  return (
    <div className="bg-white border-b mb-6">
      <div className="container mx-auto">
        {/* First row with title and logout button */}
        <div className="py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Flault Lab Management</h1>
          <div>
            <Button variant="outline" onClick={logout} className="flex items-center text-red-500 hover:text-red-600">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Border between rows */}
        <div className="border-t border-gray-200"></div>

        {/* Second row for navigation buttons and Add Task */}
        <div className="py-3 flex justify-center">
          <nav className="flex space-x-2 items-center">
            {/* Add Task button (now smaller and in the navigation row) */}
            <Button
              variant="default"
              onClick={handleOpenNewTaskPanel}
              className="gap-1 bg-blue-500 hover:bg-blue-600"
              size="sm"
            >
              <Plus className="h-3.5 w-3.5" /> Add Task
            </Button>

            {/* Navigation buttons */}
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={pathname === item.href ? "default" : "outline"}
                  className={cn("flex items-center", pathname === item.href && "bg-blue-500 hover:bg-blue-600")}
                  size="sm"
                >
                  {item.icon}
                  {item.name}
                </Button>
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* New Task Panel */}
      {isNewTaskPanelOpen && newTask && (
        <TaskPanel
          task={newTask}
          isOpen={isNewTaskPanelOpen}
          onClose={() => {
            setIsNewTaskPanelOpen(false)
            setNewTask(null)
          }}
          onSave={createNewTask}
          isNewTask={true}
          holidays={holidays.current} // Pass empty array for now, we'll need to fetch holidays in this component later
        />
      )}
    </div>
  )
}

// Add the differenceInDays function if it doesn't exist in this file
function differenceInDays(end: Date, start: Date): number {
  const diffTime = Math.abs(end.getTime() - start.getTime())
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}
