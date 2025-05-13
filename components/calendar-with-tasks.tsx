"use client"
import { useState, useEffect, useRef, useCallback } from "react"

import { addDays, format, isSameDay, parseISO, differenceInDays, subDays, isBefore, isAfter, getDay } from "date-fns"
import {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Info,
  CalendarIcon,
  AlertCircle,
  Check,
  Eye,
  EyeOff,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
// Update the imports to include the common saveTaskToDatabase function
import { TaskPanel, saveTaskToDatabase } from "./task-panel"
import { createLogEntry, saveLog } from "@/utils/history-logger"
import { supabase } from "@/lib/supabase"
import type { Holiday } from "@/app/actions/holiday-actions"
import { getActiveAndFutureHolidays } from "@/app/actions/holiday-actions"
// Add import for the new component
import { HolidayCountWarning } from "@/components/holiday-count-warning"

// Task type definition with new fields
export type Task = {
  id: number
  orderNumber: string
  orderName: string
  startDate: string
  endDate: string
  dueDate: string
  notes: string
  color: string
  effort: number
  row?: number
  customerName?: string
  phoneNumber?: string
  status: string // New field for status
  daysToComplete?: number
  numberOfHolidays?: number
  holidayDates?: string[]
}

// Remove priorityOptions array and add effortOptions array
// Status options
export const statusOptions = ["New", "In Progress", "Completed"]

// Effort quick options - make sure this is exported properly
export const effortOptions = [25, 33.33, 50, 75]

// Available colors for tasks
export const taskColors = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-amber-500",
  "bg-red-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-teal-500",
]

// Update the initialTasks to remove priority field
export const initialTasks: Task[] = []

// Number of days to display - increased from 21 to 30
const DAYS_TO_DISPLAY = 30

// Number of rows to always display
const ROWS_TO_DISPLAY = 10

// Get status color
const getStatusColor = (status: string) => {
  switch (status) {
    case "Completed":
      return "bg-green-600"
    case "In Progress":
      return "bg-yellow-500"
    default:
      return "bg-gray-500"
  }
}

// Update the getTaskCountColor function to handle zero tasks differently
const getTaskCountColor = (count: number) => {
  if (count === 0) return "bg-gray-100 text-transparent" // Make text transparent for zero count
  if (count === 1) return "bg-red-50 text-red-500"
  if (count === 2) return "bg-red-100 text-red-600"
  if (count === 3) return "bg-red-200 text-red-700"
  if (count <= 5) return "bg-red-300 text-red-800"
  return "bg-red-400 text-red-900" // More than 5 tasks
}

// New function to get effort color based on total effort
const getEffortColor = (effort: number) => {
  if (effort === 0) return "bg-gray-100 text-transparent" // Make text transparent for zero effort
  if (effort <= 25) return "bg-blue-50 text-blue-500"
  if (effort <= 50) return "bg-blue-100 text-blue-600"
  if (effort <= 75) return "bg-blue-200 text-blue-700"
  if (effort <= 100) return "bg-blue-300 text-blue-800"
  return "bg-blue-400 text-blue-900" // More than 100 effort
}

// Add a function to check if a date is a holiday and to get holiday warnings
// Add these functions to the CalendarWithTasks component

// Update the isHoliday function to only check against holidays from the database
const isHoliday = (date: Date, holidays: Holiday[]) => {
  const dateStr = format(date, "yyyy-MM-dd")
  const dayOfWeek = getDay(date) // 0 = Sunday, 1 = Monday, etc.

  // First check if this date is marked as an exception (working day)
  const isException = holidays.some((holiday) => {
    return holiday.holiday_type === "exception" && holiday.specific_date === dateStr
  })

  // If it's an exception, it's not a holiday
  if (isException) return false

  // Only check against holidays from the database, not automatically treating Sundays as holidays
  return holidays.some((holiday) => {
    if (holiday.holiday_type === "specific_date" && holiday.specific_date) {
      return holiday.specific_date === dateStr
    }

    if (holiday.holiday_type === "day_of_week" && holiday.day_of_week !== null) {
      // For day_of_week holidays, we need to check the start_from date
      if (holiday.start_from) {
        const startFrom = parseISO(holiday.start_from)
        // Only consider this a holiday if the date is on or after the start_from date
        return holiday.day_of_week === dayOfWeek && (isAfter(date, startFrom) || isSameDay(date, startFrom))
      }
      return false // If no start_from date, don't consider it a holiday
    }

    return false
  })
}

// Add a function to get holiday warnings for a task
const getHolidayWarnings = (task: Task, holidays: Holiday[]) => {
  // Skip holiday warnings for completed tasks
  if (task.status === "Completed") {
    return []
  }

  const taskStart = parseISO(task.startDate)
  const taskEnd = parseISO(task.endDate)
  const taskDueDate = parseISO(task.dueDate)

  const warnings = []

  // Check if start date is a holiday
  if (isHoliday(taskStart, holidays)) {
    warnings.push(`Start date (${format(taskStart, "MMM d")}) falls on a holiday`)
  }

  // Check if end date is a holiday
  if (isHoliday(taskEnd, holidays)) {
    warnings.push(`End date (${format(taskEnd, "MMM d")}) falls on a holiday`)
  }

  // Check if due date is a holiday
  if (isHoliday(taskDueDate, holidays)) {
    warnings.push(`Due date (${format(taskDueDate, "MMM d")}) falls on a holiday`)
  }

  return warnings
}

// Add this validation function near the top of the file, before the CalendarWithTasks component
function validateTaskDuration(startDate: string, endDate: string): { valid: boolean; message?: string } {
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  const durationInDays = differenceInDays(end, start) + 1

  if (durationInDays > 30) {
    return {
      valid: false,
      message: `Task duration cannot exceed 30 days. Current duration: ${durationInDays} days.`,
    }
  }

  return { valid: true }
}

// Add a new function to get all holiday dates within a task's duration
// Add this function before the moveTaskToDate function

const getHolidayDatesInRange = (startDate: Date, endDate: Date, holidays: Holiday[]): string[] => {
  const holidayDates: string[] = []
  const currentDate = new Date(startDate)

  // Loop through each day in the range
  while (currentDate <= endDate) {
    // Check if this day is a holiday
    if (isHoliday(currentDate, holidays)) {
      // Add the date in YYYY-MM-DD format
      holidayDates.push(format(currentDate, "yyyy-MM-dd"))
    }
    // Move to the next day
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return holidayDates
}

export function CalendarWithTasks() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [tasks, setTasks] = useState<Task[]>(initialTasks) // Initialize with initialTasks
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [moveMode, setMoveMode] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [maxStartDate, setMaxStartDate] = useState<string | null>(null)
  const { toast } = useToast()
  const taskIdRef = useRef(12)
  const nextRowRef = useRef(11)
  const [dateError, setDateError] = useState<string | null>(null)
  const calendarRef = useRef<HTMLDivElement>(null)
  const [dayWidth, setDayWidth] = useState(40) // Default width of a day column - reduced to fit more days
  const [hideCompleted, setHideCompleted] = useState(false)
  const [calendarContentRef, setCalendarContentRef] = useState<HTMLDivElement | null>(null)
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDbConnected, setIsDbConnected] = useState(true) // Track database connection status
  const [isLoading, setIsLoading] = useState(true)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  // Add a state to track tasks with outdated holiday counts
  // Add this near the other state declarations
  const [tasksWithOutdatedHolidays, setTasksWithOutdatedHolidays] = useState<Set<number>>(new Set())

  // Add this state variable with the other state declarations
  const [tasksWithOutdatedHolidayDates, setTasksWithOutdatedHolidayDates] = useState<Set<number>>(new Set())
  const [datesWithCancelledHolidays, setDatesWithCancelledHolidays] = useState<Set<string>>(new Set())

  // State for scroll buttons
  const [isHovering, setIsHovering] = useState(false)
  const [isScrollingLeft, setIsScrollingLeft] = useState(false)
  const [isScrollingRight, setIsScrollingRight] = useState(false)
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Add these state variables inside the CalendarWithTasks component
  const [searchQuery, setSearchQuery] = useState("")
  const [foundOrderIds, setFoundOrderIds] = useState<Set<number>>(new Set())
  const [highlightedDate, setHighlightedDate] = useState<Date | null>(null)

  // Add a new state to track dates with tasks that have mismatched holiday counts
  const [datesWithHolidayMismatches, setDatesWithHolidayMismatches] = useState<Set<string>>(new Set())

  // Add these state variables near the other state declarations (around line 400)
  const [datesWithNewHolidays, setDatesWithNewHolidays] = useState<Set<string>>(new Set())
  const [tasksAffectedByNewHolidays, setTasksAffectedByNewHolidays] = useState<Set<number>>(new Set())

  // Add these functions inside the component:
  // Count tasks for each day - adjust for the offset

  // Add this function to check if a task's holiday dates are outdated
  const checkForOutdatedHolidayDates = useCallback(() => {
    if (!tasks.length || !holidays.length) return

    const outdatedTaskIds = new Set<number>()
    const cancelledHolidayDates = new Set<string>()

    tasks.forEach((task) => {
      if (!task.holidayDates || task.holidayDates.length === 0) return

      // Check each stored holiday date
      task.holidayDates.forEach((dateStr) => {
        const date = parseISO(dateStr)
        // If this date is no longer a holiday, it's outdated
        if (!isHoliday(date, holidays)) {
          outdatedTaskIds.add(task.id)
          cancelledHolidayDates.add(dateStr)
        }
      })
    })

    setTasksWithOutdatedHolidayDates(outdatedTaskIds)
    setDatesWithCancelledHolidays(cancelledHolidayDates)
  }, [tasks, holidays, isHoliday])

  // Add this function after the checkForOutdatedHolidayDates function (around line 450)
  const checkForNewHolidays = useCallback(() => {
    if (!tasks.length || !holidays.length) return

    const affectedTaskIds = new Set<number>()
    const newHolidayDates = new Set<string>()

    tasks.forEach((task) => {
      // Skip completed tasks
      if (task.status === "Completed") return

      // Skip tasks without holiday_dates field
      if (!task.holidayDates) return

      const taskStart = parseISO(task.startDate)
      const taskEnd = parseISO(task.endDate)
      const currentDate = new Date(taskStart)

      // Check each day in the task's date range
      while (currentDate <= taskEnd) {
        const dateStr = format(currentDate, "yyyy-MM-dd")

        // If this date is a holiday but not in the task's holiday_dates
        if (isHoliday(currentDate, holidays) && !task.holidayDates.includes(dateStr)) {
          newHolidayDates.add(dateStr)
          affectedTaskIds.add(task.id)
        }

        // Move to the next day
        currentDate.setDate(currentDate.getDate() + 1)
      }
    })

    setDatesWithNewHolidays(newHolidayDates)
    setTasksAffectedByNewHolidays(affectedTaskIds)
  }, [tasks, holidays, isHoliday])

  // Add this useEffect to run the check when tasks or holidays change
  useEffect(() => {
    checkForOutdatedHolidayDates()
  }, [tasks, holidays, checkForOutdatedHolidayDates])

  // Add this useEffect after the checkForOutdatedHolidayDates useEffect (around line 460)
  useEffect(() => {
    checkForNewHolidays()
  }, [tasks, holidays, checkForNewHolidays])

  // Add this function to check if a date has cancelled holidays
  const hasCancelledHoliday = (date: Date) => {
    return datesWithCancelledHolidays.has(format(date, "yyyy-MM-dd"))
  }

  // Add this function to check if a date has new holidays
  const hasNewHoliday = (date: Date) => {
    return datesWithNewHolidays.has(format(date, "yyyy-MM-dd"))
  }

  const getTaskCountForDay = (date: Date) => {
    // Filter out completed tasks if hideCompleted is true
    const visibleTasks = hideCompleted ? tasks.filter((task) => task.status !== "Completed") : tasks

    // Use the exact date without adjustment
    const dateStr = format(date, "yyyy-MM-dd")

    // Count tasks that include this date
    return visibleTasks.filter((task) => {
      // Check if the date falls within the task's date range (inclusive)
      return dateStr >= task.startDate && dateStr <= task.endDate
    }).length
  }

  // Calculate total effort for each day with rounding
  const getEffortForDay = (date: Date) => {
    // Keep all other helper functions
    // ...

    // Use the exact date without adjustment
    const dateStr = format(date, "yyyy-MM-dd")

    // Sum up effort for tasks that include this date and round to nearest integer
    return Math.round(
      tasks
        .filter((task) => {
          if (hideCompleted && task.status === "Completed") return false
          // Check if the date falls within the task's date range (inclusive)
          return dateStr >= task.startDate && dateStr <= task.endDate
        })
        .reduce((total, task) => total + task.effort, 0),
    )
  }

  // Add this function to check if a date has tasks with holiday count mismatches
  const hasTasksWithHolidayMismatch = (date: Date) => {
    return datesWithHolidayMismatches.has(format(date, "yyyy-MM-dd"))
  }

  // Add this useEffect to identify dates with holiday count mismatches
  useEffect(() => {
    const dates = new Set<string>()

    tasks.forEach((task) => {
      const taskStart = parseISO(task.startDate)
      const taskEnd = parseISO(task.endDate)

      if (task.numberOfHolidays !== undefined) {
        // Calculate actual holiday count
        const actualHolidayCount = countHolidaysBetweenDates(taskStart, taskEnd)

        if (task.numberOfHolidays !== actualHolidayCount) {
          // This task has a holiday count mismatch
          // Add all dates between start and end to the set
          const currentDate = new Date(taskStart)
          while (currentDate <= taskEnd) {
            if(isHoliday(currentDate, holidays)) {
             dates.add(format(currentDate, "yyyy-MM-dd"))
            }
            currentDate.setDate(currentDate.getDate() + 1)
          }
        }
      }
    })

    setDatesWithHolidayMismatches(dates)
  }, [tasks, holidays])

  // Modify the getBackgroundColor function to handle dates with holiday mismatches
  const getBackgroundColor = (taskCount: number, isToday: boolean, date: Date) => {
    // Check if this date has new holidays - give it high priority with a noticeable color
    if (hasNewHoliday(date)) {
      return "bg-red-200" // Pink background for dates with new holidays
    }

    // Check if this date has cancelled holidays - give it highest priority with a more noticeable red
    if (hasCancelledHoliday(date)) {
      return "bg-red-200" // Brighter red background for dates with cancelled holidays
    }

    // Check if this date has tasks with holiday count mismatches
    if (hasTasksWithHolidayMismatch(date)) {
      return "bg-red-50" // Lighter red background for dates with holiday mismatches
    }

    // If this is the highlighted date from search, return yellow
    if (highlightedDate && isSameDay(date, highlightedDate)) {
      return "bg-yellow-200"
    }

    // If this is a working day exception, return yellow background
    if (isWorkingDay(date)) {
      return "bg-yellow-100"
    }

    // If this is a holiday, return grey background
    if (isHoliday(date, holidays)) {
      return "bg-gray-100"
    }

    if (isToday) return "bg-blue-50"
    if (taskCount === 0) return "bg-white"
    if (taskCount === 1) return "bg-red-50"
    if (taskCount === 2) return "bg-red-100"
    if (taskCount === 3) return "bg-red-200"
    if (taskCount <= 5) return "bg-red-300"
    return "bg-red-400" // More than 5 tasks
  }

  // Add an event listener to refresh tasks when a new task is created or updated
  // Add this to the useEffect that loads tasks from Supabase

  // UPDATED: Load tasks from Supabase on component mount with better error handling
  useEffect(() => {
    // Immediate load attempt
    const loadInitialData = async () => {
      try {
        await fetchTasks().catch((error) => {
          console.error("Initial fetchTasks failed:", error)
          // Ensure we have tasks to display
          if (tasks.length === 0) {
            setTasks(initialTasks)
          }
        })

        await fetchHolidays().catch((error) => {
          console.error("Initial fetchHolidays failed:", error)
          // Continue with empty holidays if needed
          if (holidays.length === 0) {
            setHolidays([])
          }
        })
      } catch (error) {
        console.error("Initial data loading failed:", error)
        // Ensure we have tasks to display
        if (tasks.length === 0) {
          setTasks(initialTasks)
        }
      }
    }

    loadInitialData()

    // Set up event listeners for task updates
    const handleTaskCreated = () => {
      console.log("Task created event received, refreshing tasks")
      fetchTasks().catch((error) => {
        console.error("Error refreshing tasks after creation:", error)
      })
    }

    const handleTasksUpdated = () => {
      console.log("Tasks updated event received, refreshing tasks")
      fetchTasks().catch((error) => {
        console.error("Error refreshing tasks after update:", error)
      })
    }

    // Add event listeners
    window.addEventListener("task-created", handleTaskCreated)
    window.addEventListener("tasks-updated", handleTasksUpdated)

    // Set up a refresh interval to keep data in sync - only if DB is connected
    const refreshInterval = setInterval(() => {
      if (isDbConnected) {
        fetchTasks().catch((error) => {
          console.error("Refresh fetchTasks failed:", error)
        })
      }
    }, 60000) // Refresh every 60 seconds (increased from 30 seconds)

    // Clean up interval and event listeners on unmount
    return () => {
      clearInterval(refreshInterval)
      window.removeEventListener("task-created", handleTaskCreated)
      window.removeEventListener("tasks-updated", handleTasksUpdated)
    }
  }, []) // Empty dependency array to run only on mount

  // Let's improve the fetchHolidays function to better handle errors and provide feedback
  const fetchHolidays = async () => {
    try {
      setIsLoading(true)
      console.log("Fetching holidays from database...")

      if (!supabase) {
        console.error("Supabase client is not initialized")
        toast({
          title: "Database Error",
          description: "Could not connect to database to fetch holidays.",
          variant: "destructive",
        })
        return
      }

      // Use the new function to get only active and future holidays
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

  // REWRITTEN: fetchTasks function with robust error handling
  const fetchTasks = async () => {
    try {
      setIsLoading(true)
      console.log("Fetching tasks from database...")

      // Safely check for supabase client
      if (!supabase) {
        console.error("Supabase client is not initialized")
        setIsDbConnected(false)
        setIsLoading(false)
        toast({
          title: "Database Error",
          description: "Database connection not available.",
          variant: "destructive",
        })
        // Fall back to local state or empty array
        if (tasks.length === 0) {
          setTasks(initialTasks)
        }
        return
      }

      try {
        // Use a longer timeout (20 seconds instead of 10)
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Database request timed out")), 20000)
        })

        // Make the fetch request with error handling
        const fetchPromise = supabase.from("tasks").select("*").order("created_at", { ascending: false })

        // Use Promise.race with try/catch to handle potential network errors
        let result
        try {
          result = (await Promise.race([fetchPromise, timeoutPromise])) as any
        } catch (raceError) {
          console.error("Error during fetch race:", raceError)
          throw raceError // Re-throw to be caught by outer try/catch
        }

        const { data, error } = result

        if (error) {
          console.error("Error fetching tasks:", error)
          throw error // Re-throw to be caught by outer try/catch
        }

        // Database is connected if we got here
        setIsDbConnected(true)

        if (data && data.length > 0) {
          console.log(`Fetched ${data.length} tasks from database`)

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

          setTasks(transformedTasks)

          // Find the maximum task ID
          if (transformedTasks.length > 0) {
            const maxId = Math.max(...transformedTasks.map((task) => task.id))
            taskIdRef.current = maxId + 1

            // Find the maximum row
            const maxRow = Math.max(
              ...transformedTasks.filter((task) => task.row !== undefined).map((task) => task.row || 0),
            )
            nextRowRef.current = maxRow + 1
          }
        } else {
          console.log("No tasks found in database")
          // Keep existing tasks if there are any
          if (tasks.length === 0) {
            setTasks(initialTasks)
          }
        }

        // Update last refresh time
        setLastRefreshTime(new Date())
      } catch (fetchError) {
        console.error("Error during database fetch:", fetchError)
        setIsDbConnected(false)

        // Keep existing tasks if there are any
        if (tasks.length === 0) {
          setTasks(initialTasks)
        }

        toast({
          title: "Database Error",
          description: "Failed to fetch tasks from database. Using local data instead.",
          variant: "warning",
        })
      }
    } catch (error) {
      console.error("Error loading tasks from Supabase:", error)
      setIsDbConnected(false)

      // Keep existing tasks if there are any
      if (tasks.length === 0) {
        setTasks(initialTasks)
      }

      toast({
        title: "Database Error",
        description: "Failed to connect to database. Using local data instead.",
        variant: "warning",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Handle scrolling when buttons are hovered
  useEffect(() => {
    if (isScrollingLeft) {
      scrollIntervalRef.current = setInterval(() => {
        if (calendarContentRef?.current) {
          calendarContentRef.current.scrollLeft -= 15 // Increased speed for better responsiveness
        }
      }, 16) // ~60fps
    } else if (isScrollingRight) {
      scrollIntervalRef.current = setInterval(() => {
        if (calendarContentRef?.current) {
          calendarContentRef.current.scrollLeft += 15 // Increased speed for better responsiveness
        }
      }, 16) // ~60fps
    } else if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current)
      scrollIntervalRef.current = null
    }

    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current)
        scrollIntervalRef.current = null
      }
    }
  }, [isScrollingLeft, isScrollingRight, calendarContentRef])

  // Handle scroll button clicks
  const handleScrollLeft = () => {
    if (calendarContentRef?.current) {
      // Start scrolling left
      setIsScrollingLeft(true)

      // Immediately scroll a larger amount
      calendarContentRef.current.scrollLeft -= 200

      // Stop scrolling after a short delay
      setTimeout(() => {
        setIsScrollingLeft(false)
      }, 300)
    }
  }

  const handleScrollRight = () => {
    if (calendarContentRef?.current) {
      // Start scrolling right
      setIsScrollingRight(true)

      // Immediately scroll a larger amount
      calendarContentRef.current.scrollLeft += 200

      // Stop scrolling after a short delay
      setTimeout(() => {
        setIsScrollingRight(false)
      }, 300)
    }
  }

  // Calculate day width based on container width - but keep it stable regardless of panel state
  useEffect(() => {
    const updateDayWidth = () => {
      if (calendarRef.current) {
        const containerWidth = calendarRef.current.clientWidth
        // Use a fixed width for calculations to keep the calendar stable
        const calculatedWidth = Math.floor(containerWidth / DAYS_TO_DISPLAY)
        setDayWidth(Math.max(calculatedWidth, 25)) // Minimum width of 25px to fit more days
      }
    }

    updateDayWidth()
    window.addEventListener("resize", updateDayWidth)

    return () => {
      window.removeEventListener("resize", updateDayWidth)
    }
  }, []) // Remove isPanelOpen dependency to keep width stable

  // Generate sequential days array
  const days = (() => {
    const daysArray: Date[] = []
    for (let i = 0; i < DAYS_TO_DISPLAY; i++) {
      daysArray.push(addDays(currentDate, i))
    }
    return daysArray
  })()

  const nextPeriod = () => setCurrentDate(addDays(currentDate, DAYS_TO_DISPLAY))
  const prevPeriod = () => setCurrentDate(subDays(currentDate, DAYS_TO_DISPLAY))

  // Add two new functions for single-day navigation below the existing nextPeriod and prevPeriod functions
  const nextDay = () => setCurrentDate(addDays(currentDate, 1))
  const prevDay = () => setCurrentDate(subDays(currentDate, 1))

  // Handle task click
  const handleTaskClick = (task: Task) => {
    console.log("Task clicked:", task.orderName)

    // Don't allow moving completed tasks
    if (moveMode && task.status === "Completed") {
      toast({
        title: "Cannot Move Completed Task",
        description: "Completed tasks cannot be moved.",
        variant: "destructive",
      })
      return
    }

    if (moveMode) {
      // In move mode, select the task
      setSelectedTask(task)
      setSelectedDate(null) // Clear any previously selected date

      // In the handleTaskClick function, replace the current maxStartDate calculation:
      // const taskDuration = differenceInDays(parseISO(task.endDate), parseISO(task.startDate))
      // const maxDate = subDays(parseISO(task.dueDate), taskDuration) // Use correct offset
      // setMaxStartDate(format(maxDate, "yyyy-MM-dd"))

      // With this improved version that accounts for holidays:
      // Calculate max start date based on due date and working days
      const dueDate = parseISO(task.dueDate)
      const workingDays = task.daysToComplete

      // Work backwards from due date, accounting for holidays
      let maxDate = new Date(dueDate)
      let remainingWorkingDays = workingDays - 1 // -1 because the start date counts as a working day

      // Count backward until we've found enough working days
      while (remainingWorkingDays > 0) {
        // Move one day backward
        maxDate = subDays(maxDate, 1)

        // Check if this day is a holiday
        const isHolidayDay = isHoliday(maxDate, holidays)

        // If it's not a holiday, count it as a working day
        if (!isHolidayDay) {
          remainingWorkingDays--
        }
      }

      setMaxStartDate(format(maxDate, "yyyy-MM-dd"))

      // Show info message about max start date
      toast({
        title: "Task Selected for Move",
        description: `Maximum start date: ${format(maxDate, "MMM d, yyyy")} to meet due date`,
      })
    } else {
      // In normal mode, open the edit panel
      setEditingTask({ ...task })
      setDateError(null) // Clear any previous date errors
      setIsPanelOpen(true)
    }
  }

  // Handle date click
  const handleDateClick = (date: Date) => {
    if (!moveMode) return

    console.log("Date clicked:", format(date, "yyyy-MM-dd"), ")")

    if (selectedTask) {
      // Check if the date is after max start date
      if (maxStartDate && isAfterMaxStartDate(date)) {
        // Show error message
        toast({
          title: "Invalid Date",
          description: `Cannot move task to start after ${format(parseISO(maxStartDate), "MMM d, yyyy")} due to due date constraint.`,
          variant: "destructive",
        })

        // Add a more visible UI notification
        setDateError(
          `Cannot move task: Start date cannot be after ${format(parseISO(maxStartDate), "MMM d, yyyy")} to meet the due date.`,
        )

        // Clear the error after 3 seconds
        setTimeout(() => setDateError(null), 3000)

        return
      }

      // If a task is already selected, move it to this date
      moveTaskToDate(selectedTask, date)
    } else {
      // Otherwise, just select this date
      setSelectedDate(date)
    }
  }

  // Modify the moveTaskToDate function to include holiday_dates
  // Find this section in the moveTaskToDate function where updateData is defined:

  // Move task to a new date
  const moveTaskToDate = async (task: Task, date: Date) => {
    try {
      console.log("Moving task to date:", format(date, "yyyy-MM-dd"))

      // Get the working days from the task - use the database value directly
      const workingDays = task.daysToComplete || differenceInDays(parseISO(task.endDate), parseISO(task.startDate)) + 1

      // Set new start date to the date where the user dropped the task
      const newStartDate = format(date, "yyyy-MM-dd")

      // Calculate the new end date based on working days
      // We need to find an end date such that the number of working days equals the original
      let currentDateForEndDateCalculation = date
      let remainingWorkingDays = workingDays - 1 // -1 because the start date counts as a working day

      // Count forward until we've found enough working days
      while (remainingWorkingDays > 0) {
        // Move one day forward
        currentDateForEndDateCalculation = addDays(currentDateForEndDateCalculation, 1)

        // Check if this day is a holiday
        const isHolidayDay = isHoliday(currentDateForEndDateCalculation, holidays)

        // If it's not a holiday, count it as a working day
        if (!isHolidayDay) {
          remainingWorkingDays--
        }
      }

      // The currentDate is now our end date
      const newEndDate = format(currentDateForEndDateCalculation, "yyyy-MM-dd")

      // Validate task duration
      const durationValidation = validateTaskDuration(newStartDate, newEndDate)
      if (!durationValidation.valid) {
        toast({
          title: "Validation Error",
          description: durationValidation.message,
          variant: "destructive",
        })
        return
      }

      // Format due date for display
      const formattedDueDate = format(parseISO(task.dueDate), "MMM d, yyyy")

      // Check if new end date is after due date (but allow it to be equal)
      if (isAfter(parseISO(newEndDate), parseISO(task.dueDate))) {
        // Show error message with more prominent styling and include the due date
        toast({
          title: "Cannot Move Task",
          description: `The end date cannot be later than the due date (${formattedDueDate}).`,
          variant: "destructive",
        })

        // Add a more visible UI notification with due date
        setDateError(`Cannot move task: End date cannot be later than the due date (${formattedDueDate})`)

        // Clear the error after 3 seconds
        setTimeout(() => setDateError(null), 3000)

        // Don't move the task
        return
      }

      // Clear any existing error
      setDateError(null)

      // Get the list of holiday dates
      const holidayDates = getHolidayDatesInRange(date, currentDateForEndDateCalculation, holidays)
      console.log("Holiday dates for task:", holidayDates)

      // Create updated task
      const updatedTask = {
        ...task,
        startDate: newStartDate,
        endDate: newEndDate,
        daysToComplete: workingDays, // Preserve the original daysToComplete value
        numberOfHolidays: holidayDates.length, // Use the length of the holidayDates array
        holidayDates: holidayDates,
      }

      // Update tasks in local state first for immediate UI update
      setTasks(tasks.map((t) => (t.id === task.id ? updatedTask : t)))

      // Only try to update database if connected
      if (isDbConnected) {
        console.log("Updating task in database:", updatedTask)

        try {
          // Update task in Supabase - only update the columns that definitely exist
          const updateData: any = {
            start_date: newStartDate,
            end_date: newEndDate,
            updated_at: new Date().toISOString(),
            holiday_dates: holidayDates, // Add this line
          }

          // Try to update the new columns if they're supported
          try {
            // First check if the columns exist by making a small query
            const { data: columnCheckData, error: columnCheckError } = await supabase
              .from("tasks")
              .select("days_to_complete, number_of_holidays")
              .limit(1)

            // If the query succeeds, the columns exist
            if (!columnCheckError) {
              console.log("days_to_complete and number_of_holidays columns exist, updating them")
              updateData.days_to_complete = workingDays // Preserve the original daysToComplete value
              updateData.number_of_holidays = holidayDates.length // Use length of holiday dates
            } else {
              console.log("days_to_complete and number_of_holidays columns don't exist yet, skipping them")
            }
          } catch (columnError) {
            console.log("Error checking for columns, skipping days_to_complete and number_of_holidays")
          }

          // Now update with the appropriate fields
          const { error } = await supabase.from("tasks").update(updateData).eq("id", task.id)

          if (error) {
            console.error("Error updating task in database:", error)
            toast({
              title: "Database Error",
              description: "Failed to save to database, but task was updated locally.",
              variant: "warning",
            })
            setIsDbConnected(false)
          } else {
            // Log the task movement
            const logDetails = `Task moved from ${format(parseISO(task.startDate), "MMM d, yyyy")} to ${format(date, "MMM d, yyyy")}`

            // Try to save log to Supabase
            await supabase.from("logs").insert({
              timestamp: new Date().toISOString(),
              action_type: "modified",
              task_id: task.id,
              order_number: task.orderNumber,
              order_name: task.orderName,
              details: logDetails,
              user_name: "User",
            })

            // Also save to localStorage for backward compatibility
            const logEntry = createLogEntry("modified", updatedTask, logDetails)
            saveLog(logEntry)
          }
        } catch (error) {
          console.error("Error saving to database:", error)
          toast({
            title: "Database Error",
            description: "Failed to save to database, but task was updated locally.",
            variant: "warning",
          })
          setIsDbConnected(false)
        }
      } else {
        // If database is not connected, just log locally
        const logEntry = createLogEntry(
          "modified",
          updatedTask,
          `Task moved from ${format(parseISO(task.startDate), "MMM d, yyyy")} to ${format(date, "MMM d, yyyy")} (local only)`,
        )
        saveLog(logEntry)
      }

      // Show success message
      toast({
        title: "Success",
        description: `Moved "${task.orderName}" to ${format(date, "MMM d, yyyy")}`,
      })

      // Reset selection
      setSelectedTask(null)
      setSelectedDate(null)
      setMaxStartDate(null)
    } catch (error) {
      console.error("Error moving task:", error)
      toast({
        title: "Error",
        description: "Failed to move task. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Save edited task
  // Update the saveTask function to use the common function
  const saveTask = async (updatedTask: Task) => {
    try {
      console.log("Saving task to database:", updatedTask)

      // Find the original task for comparison
      const originalTask = tasks.find((task) => task.id === updatedTask.id)

      if (!originalTask) {
        toast({
          title: "Error",
          description: "Task not found",
          variant: "destructive",
        })
        return
      }

      // Calculate holiday dates
      const taskStart = parseISO(updatedTask.startDate)
      const taskEnd = parseISO(updatedTask.endDate)
      const holidayDates = getHolidayDatesInRange(taskStart, taskEnd, holidays)

      // Update the task with holiday dates
      const finalTask = {
        ...updatedTask,
        holidayDates: holidayDates,
        numberOfHolidays: holidayDates.length,
      }

      // Use the common function to save to database
      const result = await saveTaskToDatabase(finalTask, originalTask, supabase, isDbConnected)

      if (!result.success) {
        toast({
          title: "Error",
          description: result.error,
          variant: "warning",
        })
      }

      // Update tasks in local state
      setTasks(tasks.map((task) => (task.id === updatedTask.id ? finalTask : task)))
      setIsPanelOpen(false)
      setEditingTask(null)

      toast({
        title: "Success",
        description: "Task updated successfully" + (isDbConnected ? "" : " (local only)"),
      })
    } catch (error) {
      console.error("Error saving task:", error)
      toast({
        title: "Error",
        description: "Failed to save task. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Generate change details for logging
  const generateChangeDetails = (original: Task, updated: Task): string => {
    const changes: string[] = []

    if (original.orderNumber !== updated.orderNumber) {
      changes.push(`Order Number: ${original.orderNumber} → ${updated.orderNumber}`)
    }

    if (original.orderName !== updated.orderName) {
      changes.push(`Order Name: ${original.orderName} → ${updated.orderName}`)
    }

    if (original.customerName !== updated.customerName) {
      changes.push(`Customer: ${original.customerName || "None"} → ${updated.customerName || "None"}`)
    }

    if (original.status !== updated.status) {
      changes.push(`Status: ${original.status} → ${updated.status}`)
    }

    if (original.effort !== updated.effort) {
      changes.push(`Effort: ${original.effort} → ${updated.effort}`)
    }

    if (original.startDate !== updated.startDate) {
      changes.push(
        `Start Date: ${format(parseISO(original.startDate), "MMM d, yyyy")} → ${format(parseISO(updated.startDate), "MMM d, yyyy")}`,
      )
    }

    if (original.endDate !== updated.endDate) {
      changes.push(
        `End Date: ${format(parseISO(original.endDate), "MMM d, yyyy")} → ${format(parseISO(updated.endDate), "MMM d, yyyy")}`,
      )
    }

    if (original.dueDate !== updated.dueDate) {
      changes.push(
        `Due Date: ${format(parseISO(original.dueDate), "MMM d, yyyy")} → ${format(parseISO(updated.dueDate), "MMM d, yyyy")}`,
      )
    }

    if (original.notes !== updated.notes) {
      if (updated.notes.length > 50) {
        changes.push(`Notes updated`)
      } else {
        changes.push(`Notes: "${original.notes || "None"}" → "${updated.notes || "None"}`)
      }
    }

    return changes.length > 0 ? `Changes: ${changes.join(", ")}` : "No significant changes detected"
  }

  // Toggle hide completed tasks
  const toggleHideCompleted = () => {
    setHideCompleted(!hideCompleted)
  }

  // Update the taskRows function to properly show all tasks that should be visible

  // Group tasks by row
  const taskRows = (() => {
    try {
      // Filter visible tasks - MODIFIED to only show tasks that start within the visible period
      const visibleTasks = tasks.filter((task) => {
        // Parse dates for comparison
        const taskStart = parseISO(task.startDate)
        const taskEnd = parseISO(task.endDate)
        const periodStart = currentDate
        const periodEnd = addDays(currentDate, DAYS_TO_DISPLAY - 1)

        // Filter out completed tasks
        if (hideCompleted && task.status === "Completed") {
          return false
        }

        // A task is visible ONLY if it starts within or after the visible period
        // This change removes tasks that start before the current visible period
        return (
          isAfter(taskStart, periodStart) ||
          isSameDay(taskStart, periodStart) ||
          (isBefore(taskStart, periodEnd) && isAfter(taskEnd, periodStart))
        )
      })

      // Sort tasks by start date (earlier start dates first)
      const sortedTasks = [...visibleTasks].sort((a, b) => {
        const aStart = parseISO(a.startDate)
        const bStart = parseISO(b.startDate)
        return aStart.getTime() - bStart.getTime()
      })

      // Initialize rows array
      const rows: Task[][] = []

      // For each task, find the first row where it can be placed without overlap
      sortedTasks.forEach((task) => {
        const taskStart = parseISO(task.startDate)
        const taskEnd = parseISO(task.endDate)

        // Try to find a row where the task doesn't overlap with existing tasks
        let rowIndex = 0
        let placed = false

        while (rowIndex < rows.length && !placed) {
          const rowTasks = rows[rowIndex]
          let canPlaceInRow = true

          // Check if the task overlaps with any task in this row
          for (const existingTask of rowTasks) {
            const existingStart = parseISO(existingTask.startDate)
            const existingEnd = parseISO(existingTask.endDate)

            // Check for overlap: if one task's start is before or on the other's end AND
            // the first task's end is after or on the other's start
            if (
              (isBefore(taskStart, existingEnd) || isSameDay(taskStart, existingEnd)) &&
              (isAfter(taskEnd, existingStart) || isSameDay(taskEnd, existingStart))
            ) {
              canPlaceInRow = false
              break
            }
          }

          // If we can place the task in this row, do it
          if (canPlaceInRow) {
            rows[rowIndex].push({ ...task, row: rowIndex + 1 }) // +1 because rows are 1-indexed
            placed = true
          } else {
            rowIndex++
          }
        }

        // If we couldn't place the task in any existing row, create a new row
        if (!placed) {
          rows.push([{ ...task, row: rows.length + 1 }]) // +1 because rows are 1-indexed
        }
      })

      // Ensure we have at least 10 rows
      while (rows.length < ROWS_TO_DISPLAY) {
        rows.push([])
      }

      return rows
    } catch (error) {
      console.error("Error calculating task rows:", error)
      // Return 10 empty rows if there's an error
      return Array(ROWS_TO_DISPLAY).fill([])
    }
  })()

  // Also update the getTaskPosition function to correctly handle tasks that start before the visible period

  // Update the getTaskPosition function to correctly identify holiday days
  const getTaskPosition = (task: Task) => {
    try {
      const taskStart = parseISO(task.startDate)
      const taskEnd = parseISO(task.endDate)
      const periodStart = currentDate
      const periodEnd = addDays(currentDate, DAYS_TO_DISPLAY - 1)

      // Calculate start offset - Add 1 to fix the visual offset
      let startOffset = 0
      if (isAfter(taskStart, periodStart)) {
        // Task starts within or at the beginning of the visible period
        startOffset = differenceInDays(taskStart, periodStart) + 1 // Add 1 to fix the visual offset
      }

      // Calculate visible duration
      let visibleDuration = 0
      if (isBefore(taskEnd, periodEnd) || isSameDay(taskEnd, periodEnd)) {
        // Task ends before or at the end of the visible period
        visibleDuration = differenceInDays(taskEnd, addDays(periodStart, startOffset - 1)) + 1
      } else {
        // Task ends after the visible period
        visibleDuration = DAYS_TO_DISPLAY - startOffset + 1
      }

      // Ensure the duration is at least 1 day
      visibleDuration = Math.max(1, visibleDuration)

      // Check if task starts/ends in visible period
      const isTaskStart = isSameDay(taskStart, periodStart) || isAfter(taskStart, periodStart)
      const isTaskEnd = isSameDay(taskEnd, periodEnd) || isBefore(taskEnd, periodEnd)

      // Calculate which days of the task fall on holidays
      const holidayDays: number[] = []
      for (let i = 0; i < visibleDuration; i++) {
        // Fix the offset calculation - remove the extra -1 that was causing the +1 day shift
        const day = addDays(periodStart, startOffset + i)
        if (isHoliday(day, holidays)) {
          holidayDays.push(i)
        }
      }

      // Calculate working days (total days minus holidays)
      const workingDays = visibleDuration - holidayDays.length

      return {
        startOffset,
        duration: visibleDuration,
        workingDays,
        isTaskStart,
        isTaskEnd,
        holidayDays,
      }
    } catch (error) {
      console.error("Error calculating task position:", error)
      return { startOffset: 0, duration: 1, workingDays: 1, isTaskStart: true, isTaskEnd: true, holidayDays: [] }
    }
  }

  // Toggle move mode
  const toggleMoveMode = () => {
    setMoveMode(!moveMode)
    setSelectedTask(null)
    setSelectedDate(null)
    setDateError(null) // Clear any existing error when toggling move mode
    setMaxStartDate(null) // Clear max start date
  }

  // Check if a date is selected
  const isDateSelected = (date: Date) => {
    return selectedDate && isSameDay(date, selectedDate)
  }

  // Check if a date is after max start date
  const isAfterMaxStartDate = (date: Date) => {
    if (!maxStartDate) return false
    // Only return true for dates strictly after the max start date
    const maxDate = parseISO(maxStartDate)
    // Use isSameDay to properly check if it's the max date (which should be allowed)
    if (isSameDay(date, maxDate)) return false
    // Only return true if the date is after the max date
    return isAfter(date, maxStartDate)
  }

  // Check if a date is exactly one day after max start date
  const isOneDayAfterMaxStartDate = (date: Date) => {
    if (!maxStartDate) return false
    const maxDate = parseISO(maxStartDate)
    const oneDayAfterMax = addDays(maxDate, 1)
    return isSameDay(date, oneDayAfterMax)
  }

  // Check if task is narrow (less than 3 days)
  const isNarrowTask = (duration: number) => {
    return duration < 4
  }

  const getHolidayName = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd")
    const dayOfWeek = getDay(date) // 0 = Sunday, 1 = Monday, etc.

    const matchingHolidays = holidays.filter((holiday) => {
      if (holiday.holiday_type === "specific_date" && holiday.specific_date) {
        return holiday.specific_date === dateStr
      }
      if (holiday.holiday_type === "day_of_week" && holiday.day_of_week !== null) {
        return holiday.day_of_week === dayOfWeek
      }
      return false
    })

    if (matchingHolidays.length === 0) return null

    // If there are multiple holidays on the same day, join their names
    return matchingHolidays.map((h) => h.name).join(", ")
  }

  // Add this function inside the component before the return statement
  const handleSearch = () => {
    if (!searchQuery.trim()) {
      setFoundOrderIds(new Set())
      setHighlightedDate(null)
      return
    }

    const query = searchQuery.toLowerCase().trim()
    const matchingTasks = tasks.filter((task) => task.orderNumber.toLowerCase() === query)

    // Set the found order IDs
    setFoundOrderIds(new Set(matchingTasks.map((task) => task.id)))

    // If we found a match, set the highlighted date to the start date of the first match
    if (matchingTasks.length > 0) {
      const firstMatch = matchingTasks[0]
      const startDate = parseISO(firstMatch.startDate)
      setHighlightedDate(startDate)

      // Ensure the start date is visible in the current view
      if (isBefore(startDate, currentDate) || isAfter(startDate, addDays(currentDate, DAYS_TO_DISPLAY - 1))) {
        setCurrentDate(startDate)
      }

      // Scroll to the start date (with a slight delay to ensure rendering)
      setTimeout(() => {
        if (calendarContentRef?.current) {
          // Calculate position to scroll to
          const dayIndex = differenceInDays(startDate, currentDate)
          if (dayIndex >= 0 && dayIndex < DAYS_TO_DISPLAY) {
            const scrollPosition = dayIndex * dayWidth
            calendarContentRef.current.scrollLeft = scrollPosition - 100 // Scroll a bit to the left for better visibility
          }
        }
      }, 100)

      toast({
        title: "Order Found",
        description: `Found order ${firstMatch.orderNumber}: ${firstMatch.orderName}`,
      })
    } else {
      toast({
        title: "Not Found",
        description: `No orders matching "${searchQuery}" found`,
        variant: "destructive",
      })
    }
  }

  // Add a useEffect to clear highlighting when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Only clear if we have a highlighted date and the click wasn't on a relevant element
      if (highlightedDate) {
        // Check if the click was on a task or search-related element
        const isRelevantElement = (e.target as Element)?.closest("[data-task-id], [data-search]")
        if (!isRelevantElement) {
          setHighlightedDate(null)
          setFoundOrderIds(new Set())
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [highlightedDate]) // Only depend on highlightedDate

  // Add a function to recalculate holiday count for a specific task
  const countHolidaysBetweenDates = (startDate: Date, endDate: Date): number => {
    let count = 0
    const currentDate = new Date(startDate) // Create a new Date object to avoid modifying the original

    while (currentDate <= endDate) {
      if (isHoliday(currentDate, holidays)) {
        count++
      }
      currentDate.setDate(currentDate.getDate() + 1) // Use setDate to increment the date
    }

    return count
  }

  // Modify the recalculateHolidayCount function to be more explicit that it's a manual update
  const recalculateHolidayCount = async (taskId: number) => {
    // Find the task
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    // Calculate actual holiday dates
    const startDate = parseISO(task.startDate)
    const endDate = parseISO(task.endDate)
    const holidayDates = getHolidayDatesInRange(startDate, endDate, holidays)

    // Update the task
    const updatedTask = {
      ...task,
      numberOfHolidays: holidayDates.length,
      holidayDates: holidayDates,
    }

    try {
      // Update in database
      if (supabase) {
        await supabase
          .from("tasks")
          .update({
            number_of_holidays: holidayDates.length,
            holiday_dates: holidayDates,
            updated_at: new Date().toISOString(),
          })
          .eq("id", taskId)
      }

      // Update in local state
      setTasks(tasks.map((t) => (t.id === taskId ? updatedTask : t)))

      // Remove from outdated set
      setTasksWithOutdatedHolidays((prev) => {
        const newSet = new Set(prev)
        newSet.delete(taskId)
        return newSet
      })

      toast({
        title: "Holiday Count Updated",
        description: `Task holiday count manually updated to ${holidayDates.length}`,
      })
    } catch (error) {
      console.error("Error updating holiday count:", error)
      toast({
        title: "Error",
        description: "Failed to update holiday count",
        variant: "destructive",
      })
    }
  }

  // Check if a date is a working day exception
  const isWorkingDay = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd")
    return holidays.some((holiday) => holiday.holiday_type === "exception" && holiday.specific_date === dateStr)
  }

  // Declare holidayName and workingDayName before using them
  const holidayName = getHolidayName(currentDate)
  const workingDayName = isWorkingDay(currentDate) ? "Working Day Exception" : null

  // Add a function to calculate the new end date
  const calculateEndDate = (startDate: Date, workingDays: number): Date => {
    let currentDate = new Date(startDate)
    let remainingWorkingDays = workingDays - 1 // Subtract 1 for the start date

    while (remainingWorkingDays > 0) {
      currentDate = addDays(currentDate, 1)
      if (!isHoliday(currentDate, holidays)) {
        remainingWorkingDays--
      }
    }

    return currentDate
  }

  return (
    <div className="container mx-auto">
      <div className="flex">
        {/* Main calendar container */}
        <Card className="p-4 flex-1" ref={calendarRef}>
          {/* Header with centered buttons */}
          <div className="flex flex-col items-center mb-4">
            <h2 className="text-xl font-bold mb-3">
              {format(currentDate, "MMM d")} - {format(addDays(currentDate, DAYS_TO_DISPLAY - 1), "MMM d, yyyy")}
            </h2>
            <div className="flex gap-2">
              <Button
                variant={moveMode ? "default" : "outline"}
                size="sm"
                onClick={toggleMoveMode}
                className={`h-7 text-xs ${moveMode ? "bg-blue-500 hover:bg-blue-600" : ""}`}
              >
                {moveMode ? "Exit Move Mode" : "Move Tasks"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleHideCompleted}
                className="flex items-center gap-1 h-7 text-xs"
              >
                {hideCompleted ? (
                  <>
                    <Eye className="h-3.5 w-3.5" /> Show Completed
                  </>
                ) : (
                  <>
                    <EyeOff className="h-3.5 w-3.5" /> Hide Completed
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchTasks()}
                className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white h-7 text-xs"
                title="Refresh tasks from database"
                disabled={isRefreshing}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                >
                  <path d="M21 2v6h-6"></path>
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                  <path d="M3 22v-6h6"></path>
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
                </svg>
                Refresh
              </Button>

              {/* Add the day-by-day navigation buttons here */}
              <div className="flex border rounded-md overflow-hidden">
                <Button variant="ghost" size="sm" onClick={prevDay} className="rounded-none border-r h-7 px-1.5 py-0">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={nextDay} className="rounded-none h-7 px-1.5 py-0">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Keep the existing period navigation buttons */}
              <div className="flex border rounded-md overflow-hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={prevPeriod}
                  className="rounded-none border-r h-7 px-1.5 py-0"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <ChevronLeft className="h-3.5 w-3.5 -ml-2" />
                </Button>
                <Button variant="ghost" size="sm" onClick={nextPeriod} className="rounded-none h-7 px-1.5 py-0">
                  <ChevronRight className="h-3.5 w-3.5" />
                  <ChevronRight className="h-3.5 w-3.5 -ml-2" />
                </Button>
              </div>
            </div>
          </div>

          {moveMode && (
            <div className="bg-blue-50 p-2 mb-4 rounded-md text-sm">
              {selectedTask ? (
                <div className="flex items-center">
                  <div className="font-medium">Selected: {selectedTask.orderName}</div>
                  <ArrowRight className="h-4 w-4 mx-2" />
                  <div>Now click on a date to move this task</div>
                  {maxStartDate && (
                    <div className="ml-2 text-blue-700 font-medium flex items-center">
                      <CalendarIcon className="h-3 w-3 mr-1" />
                      Max start date: {format(parseISO(maxStartDate), "MMM d")}
                    </div>
                  )}
                </div>
              ) : (
                <p>Step 1: Click on a task to select it for moving</p>
              )}
            </div>
          )}

          {moveMode && dateError && (
            <div className="bg-red-100 border border-red-400 text-red-700 p-2 mb-4 rounded-md text-sm font-medium">
              {dateError}
            </div>
          )}

          {isLoading && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <span className="ml-3 text-gray-500">Loading tasks...</span>
            </div>
          )}

          <div
            className="relative overflow-x-auto"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => {
              setIsHovering(false)
              setIsScrollingLeft(false)
              setIsScrollingRight(false)
            }}
          >
            <div
              className="overflow-x-auto"
              ref={calendarContentRef}
              style={{
                cursor: "default",
                overflowY: "hidden",
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "auto",
                msOverflowStyle: "auto",
                width: "100%",
                paddingRight: "1px", // Add slight padding to ensure last column is fully visible
              }}
            >
              {/* Date header - sticky */}
              <div className="sticky top-0 z-30 bg-white border-b pb-2 mb-4 min-w-fit">
                <div className="flex">
                  {days.map((day, index) => {
                    // Use our existing functions for consistency
                    const isHolidayDate = isHoliday(day, holidays)
                    const isWorkingDayException = isWorkingDay(day)
                    const hasCancelledHolidayDate = hasCancelledHoliday(day)
                    const hasNewHolidayDate = hasNewHoliday(day)

                    return (
                      <div
                        key={index}
                        className={cn(
                          "flex-shrink-0 text-center font-medium text-xs",
                          index === 0 && "pl-1",
                          index === days.length - 1 && "pr-1",
                          isHolidayDate && "bg-gray-100",
                          isWorkingDayException && "bg-yellow-100",
                          hasCancelledHolidayDate && "bg-red-200",
                          hasNewHolidayDate && "bg-red-200",
                        )}
                        style={{ width: `${dayWidth}px` }}
                        onClick={() => moveMode && selectedTask && handleDateClick(day)}
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <div>{format(day, "EEE")}</div>
                                <div className="flex items-center justify-center">{format(day, "d")}</div>
                              </div>
                            </TooltipTrigger>
                            {/* Modify the TooltipContent section with this enhanced version: */}
                            <TooltipContent>
                              <div className="text-xs">
                                {isHolidayDate && <div className="font-medium">Holiday: {getHolidayName(day)}</div>}
                                {isWorkingDayException && (
                                  <div className="font-medium">
                                    Working Day Exception:{" "}
                                    {holidays.find(
                                      (h) =>
                                        h.holiday_type === "exception" && h.specific_date === format(day, "yyyy-MM-dd"),
                                    )?.name || "Working Day"}
                                  </div>
                                )}
                                {hasNewHolidayDate && (
                                  <div className="font-medium text-red-600">
                                    <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                                    New Holiday: {getHolidayName(day)}
                                    <div className="mt-1 text-red-500">Tasks on this date need to be updated!</div>
                                  </div>
                                )}
                                {hasCancelledHolidayDate && (
                                  <div className="font-medium text-red-600">
                                    <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                                    Cancelled Holiday
                                    <div className="mt-1 text-red-500">Tasks on this date need to be updated!</div>
                                  </div>
                                )}
                                {hasTasksWithHolidayMismatch(day) && (
                                  <div className="font-medium text-red-600">
                                    Tasks on this date need holiday count updates
                                  </div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        {/* Effort indicator - new row */}
                        <div className="mt-1">
                          {(() => {
                            const effort = getEffortForDay(day)
                            return (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className={`text-[10px] rounded-sm px-1 py-0.5 ${getEffortColor(effort)}`}>
                                      {effort > 0 ? effort : "-"}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="text-xs">
                                      {effort === 0 ? "No effort" : `${effort} effort points`} on {format(day, "MMM d")}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )
                          })()}
                        </div>

                        {/* Task count indicator */}
                        <div className="mt-1">
                          {(() => {
                            const count = getTaskCountForDay(day)
                            return (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className={`text-[10px] rounded-sm px-1 py-0.5 ${getTaskCountColor(count)}`}>
                                      {count > 0 ? count : "-"}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="text-xs">
                                      {count === 0 ? "No tasks" : `${count} ${count === 1 ? "task" : "tasks"}`} on{" "}
                                      {format(day, "MMM d")}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )
                          })()}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Calendar body with vertical scrolling */}
              <div className="relative min-w-fit max-h-[500px] overflow-y-auto">
                {/* Date grid lines */}
                <div className="absolute top-0 left-0 right-0 bottom-0 flex pointer-events-none">
                  {days.map((day, index) => {
                    // Calculate these variables for each day
                    const isHolidayDate = isHoliday(day, holidays)
                    const isWorkingDayException = isWorkingDay(day)
                    const hasCancelledHolidayDate = hasCancelledHoliday(day)
                    const hasNewHolidayDate = hasNewHoliday(day)
                    const dateHasTasksWithHolidayMismatch = hasTasksWithHolidayMismatch(day)
                    const isHighlighted = highlightedDate && isSameDay(day, highlightedDate)
                    const isSelected = moveMode && selectedTask && isDateSelected(day)

                    return (
                      <div
                        key={index}
                        className={cn(
                          "flex-shrink-0 border-r h-full",
                          index === 0 && "border-l",
                          isHolidayDate && "bg-gray-100",
                          isWorkingDayException && "bg-yellow-100",
                          hasCancelledHolidayDate && "bg-red-200",
                          hasNewHolidayDate && "bg-red-200",
                          isHighlighted && "bg-yellow-200",
                          isSelected && "bg-blue-100",
                          dateHasTasksWithHolidayMismatch && "bg-red-50",
                        )}
                        style={{ width: `${dayWidth}px` }}
                      />
                    )
                  })}
                </div>

                {/* Date click areas - only in move mode with selected task */}
                {moveMode && selectedTask && (
                  <div
                    className="absolute top-0 left-0 right-0 bottom-0 flex z-20"
                    style={{
                      height: `${taskRows.length * 8 + (taskRows.length - 1) * 2}rem`,
                    }}
                  >
                    {days.map((day, index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex-shrink-0 h-full",
                          "cursor-pointer hover:bg-blue-100 hover:border hover:border-blue-300 hover:border-dashed",
                          isDateSelected(day) && "bg-blue-100 border border-blue-300",
                          isOneDayAfterMaxStartDate(day) && "bg-red-100",
                        )}
                        style={{ width: `${dayWidth}px` }}
                        onClick={() => handleDateClick(day)}
                      />
                    ))}
                  </div>
                )}

                {/* Task rows */}
                <div className="relative">
                  {taskRows.map((row, rowIndex) => (
                    <div key={rowIndex} className="h-8 relative mb-2">
                      {row.map((task) => {
                        const position = getTaskPosition(task)
                        const isSelected = selectedTask?.id === task.id
                        const taskStart = parseISO(task.startDate)
                        const taskEnd = parseISO(task.endDate)
                        const isSingleDayTask = isSameDay(taskStart, taskEnd)
                        const isNarrow = isNarrowTask(position.duration)
                        const isCompleted = task.status === "Completed"

                        // Render the main task bar
                        return (
                          <TooltipProvider key={task.id}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                {/* Modify the task bar rendering to add a visual indicator for outdated holiday dates */}
                                <div
                                  key={task.id}
                                  data-task-id={task.id}
                                  className={cn(
                                    "h-8 px-1 text-white text-xs font-medium truncate flex items-center absolute cursor-pointer",
                                    task.color,
                                    "rounded-sm",
                                    !position.isTaskStart && !isSingleDayTask && "rounded-l-none",
                                    !position.isTaskEnd && !isSingleDayTask && "rounded-r-none",
                                    isSelected && "ring-2 ring-white ring-offset-2 ring-offset-blue-500",
                                    // Grey out completed tasks
                                    isCompleted && "opacity-60 grayscale",
                                    // Add cursor not-allowed for completed tasks in move mode
                                    moveMode && isCompleted && "cursor-not-allowed",
                                    // Highlight found tasks
                                    foundOrderIds.has(task.id) && "ring-2 ring-yellow-400 ring-offset-1",
                                    // Add warning border for tasks that start or end on holidays
                                    (isHoliday(taskStart, holidays) ||
                                      isHoliday(taskEnd, holidays) ||
                                      isHoliday(parseISO(task.dueDate), holidays)) &&
                                      !isCompleted &&
                                      "border-2 border-amber-400",
                                    // Add warning border for tasks with outdated holiday dates
                                    tasksWithOutdatedHolidayDates.has(task.id) && "border-2 border-red-500",
                                    tasksAffectedByNewHolidays.has(task.id) && "border-2 border-red-500 animate-pulse",
                                  )}
                                  style={{
                                    left: `${position.startOffset * dayWidth}px`,
                                    width: `${position.duration * dayWidth}px`,
                                    zIndex: 10,
                                    maxWidth: `${DAYS_TO_DISPLAY * dayWidth}px`, // Ensure task doesn't exceed calendar width
                                  }}
                                  onClick={() => handleTaskClick(task)}
                                >
                                  <div className="flex items-center w-full">
                                    {isNarrow ? (
                                      <>
                                        <div
                                          className={`w-2 h-2 rounded-full ${getStatusColor(task.status)} mr-1`}
                                        ></div>
                                        <span className="font-bold text-[10px] mr-0.5 whitespace-nowrap">
                                          {task.orderNumber}
                                        </span>
                                        {position.duration > 1 && <Info className="h-3 w-3 ml-auto" />}
                                        {tasksWithOutdatedHolidayDates.has(task.id) && (
                                          <AlertCircle className="h-3 w-3 ml-1 text-red-200" />
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <div
                                          className={`w-2 h-2 rounded-full ${getStatusColor(task.status)} mr-1`}
                                        ></div>
                                        <span className="font-bold mr-1">{task.orderNumber}</span>
                                        <span className="truncate">{task.orderName}</span>
                                        {tasksWithOutdatedHolidayDates.has(task.id) && (
                                          <AlertCircle className="h-3.5 w-3.5 ml-auto text-red-200" />
                                        )}
                                      </>
                                    )}
                                    {tasksAffectedByNewHolidays.has(task.id) && (
                                      <AlertCircle className="h-3.5 w-3.5 ml-auto text-red-200 animate-pulse" />
                                    )}
                                  </div>
                                </div>
                              </TooltipTrigger>
                              {/* Modify the tooltip content in the task rendering section */}

                              <TooltipContent>
                                <div className="space-y-1">
                                  <div>
                                    <strong>Order:</strong> {task.orderNumber}
                                  </div>
                                  <div>
                                    <strong>Name:</strong> {task.orderName}
                                  </div>
                                  <div>
                                    <strong>Customer:</strong> {task.customerName || "-"}
                                  </div>
                                  <div>
                                    <strong>Status:</strong> {task.status}
                                  </div>
                                  <div>
                                    <strong>Effort:</strong> {task.effort} points
                                  </div>
                                  {task.numberOfHolidays !== undefined && (
                                    <div>
                                      <strong>Holidays:</strong> {task.numberOfHolidays} days
                                    </div>
                                  )}
                                  <div>
                                    <strong>Dates:</strong> {format(taskStart, "MMM d")} - {format(taskEnd, "MMM d")}
                                  </div>
                                  <div>
                                    <strong className="text-red-500">Due:</strong>{" "}
                                    <span className="text-red-500 font-medium">
                                      {format(parseISO(task.dueDate), "MMM d")}
                                    </span>
                                  </div>
                                  {isCompleted && (
                                    <div className="text-green-600 font-medium flex items-center">
                                      <Check className="h-3 w-3 mr-1" /> Completed
                                    </div>
                                  )}
                                  {moveMode && isCompleted && (
                                    <div className="text-red-600 font-medium flex items-center mt-1">
                                      <AlertCircle className="h-3 w-3 mr-1" /> Cannot be moved
                                    </div>
                                  )}
                                  {tasksWithOutdatedHolidayDates.has(task.id) && (
                                    <div className="text-red-600 font-medium flex items-center mt-1">
                                      <AlertCircle className="h-3 w-3 mr-1" /> Contains cancelled holidays
                                      <div className="ml-4 text-xs">Task needs update</div>
                                    </div>
                                  )}
                                  {tasksAffectedByNewHolidays.has(task.id) && (
                                    <div className="text-red-600 font-medium flex items-center mt-1">
                                      <AlertCircle className="h-3 w-3 mr-1" /> Affected by new holidays
                                      <div className="ml-4 text-xs">Task needs update</div>
                                    </div>
                                  )}
                                  {task.notes && (
                                    <div className="border-t pt-1 mt-1">
                                      <strong>Notes:</strong> <span className="text-gray-700">{task.notes}</span>
                                    </div>
                                  )}

                                  {/* Enhanced holiday warnings section */}
                                  {(isHoliday(taskStart, holidays) ||
                                    isHoliday(taskEnd, holidays) ||
                                    isHoliday(parseISO(task.dueDate), holidays)) && (
                                    <div className="border-t pt-1 mt-1 text-amber-600 font-medium">
                                      <AlertCircle className="h-3 w-3 inline mr-1" />
                                      <div>
                                        <p>Warning: Holiday conflicts detected:</p>
                                        <ul className="list-disc pl-4 mt-1">
                                          {isHoliday(taskStart, holidays) && (
                                            <li className="text-xs">
                                              Start date ({format(taskStart, "MMM d")}) falls on a holiday
                                            </li>
                                          )}
                                          {isHoliday(taskEnd, holidays) && (
                                            <li className="text-xs">
                                              End date ({format(taskEnd, "MMM d")}) falls on a holiday
                                            </li>
                                          )}
                                          {isHoliday(parseISO(task.dueDate), holidays) && (
                                            <li className="text-xs">
                                              Due date ({format(parseISO(task.dueDate), "MMM d")}) falls on a holiday
                                            </li>
                                          )}
                                        </ul>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                            {/* Add overlay divs for holiday days */}
                            {position.holidayDays.map((dayOffset) => (
                              <div
                                key={`${task.id}-holiday-${dayOffset}`}
                                className="absolute h-8 bg-gray-500 opacity-40 pointer-events-none"
                                style={{
                                  left: `${(position.startOffset + dayOffset) * dayWidth}px`,
                                  width: `${dayWidth}px`,
                                  zIndex: 11,
                                }}
                              />
                            ))}
                          </TooltipProvider>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
        {/* Task Edit Panel - separate from main container with margin */}
        <div className="ml-4">
          {tasksWithOutdatedHolidays.has(editingTask?.id || -1) && (
            <HolidayCountWarning
              taskId={editingTask?.id || -1}
              onUpdate={() => recalculateHolidayCount(editingTask?.id || -1)}
            />
          )}
          {/* Update the TaskPanel component to pass supabase */}
          <TaskPanel
            task={editingTask}
            isOpen={isPanelOpen}
            onClose={() => {
              setIsPanelOpen(false)
              setEditingTask(null)
            }}
            onSave={saveTask}
            allTasks={tasks} // Pass all tasks to the panel
            holidays={holidays} // Pass holidays to the panel
            tasksAffectedByNewHolidays={tasksAffectedByNewHolidays} // Add this line
            supabase={supabase}
            isDbConnected={isDbConnected}
          />
        </div>
      </div>
    </div>
  )
}

function differenceInDays(end: Date, start: Date): number {
  const diffTime = Math.abs(end.getTime() - start.getTime())
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}
