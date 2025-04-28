"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import {
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  getDay,
  isAfter,
} from "date-fns"
import { ChevronLeft, ChevronRight, Check, Eye, EyeOff, RefreshCw, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { Task } from "@/components/calendar-with-tasks"
import { TaskPanel } from "@/components/task-panel"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"
import type { Holiday } from "@/app/actions/holiday-actions"
import { getActiveAndFutureHolidays } from "@/app/actions/holiday-actions"

// Maximum number of tasks to display per day before showing "+X more"
// Increased from 3 to 5 to show more tasks per cell
const MAX_TASKS_TO_DISPLAY = 5

export default function DueDatesPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showCompletedTasks, setShowCompletedTasks] = useState(false)
  const [hideCompleted, setHideCompleted] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { toast } = useToast()

  // Add these state variables inside the DueDatesPage component
  const [searchQuery, setSearchQuery] = useState("")
  const [foundOrderIds, setFoundOrderIds] = useState<Set<number>>(new Set())
  const [highlightedDate, setHighlightedDate] = useState<Date | null>(null)
  const calendarRef = useRef<HTMLDivElement>(null)

  // Add refs to track state and prevent infinite loops
  const isRefreshingRef = useRef(false)
  const prevTasksRef = useRef<Task[]>([])
  const isInitialMount = useRef(true)

  // Add the fetchHolidays function and holidays state
  const [holidays, setHolidays] = useState<Holiday[]>([])

  // Update the isHoliday function
  const isHoliday = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd")
    const dayOfWeek = getDay(date) // 0 = Sunday, 1 = Monday, etc.

    // First check if this date is marked as an exception (working day)
    const isException = holidays.some((holiday) => {
      return holiday.holiday_type === "exception" && holiday.specific_date === dateStr
    })

    // If it's an exception, it's not a holiday
    if (isException) return false

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

  // Update the isWorkingDay function
  const isWorkingDay = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd")

    return holidays.some((holiday) => {
      return holiday.holiday_type === "exception" && holiday.specific_date === dateStr
    })
  }

  // Add this function to get holiday name
  const getHolidayName = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd")
    const dayOfWeek = getDay(date) // 0 = Sunday, 1 = Monday, etc.

    const matchingHolidays = holidays.filter((holiday) => {
      if (holiday.holiday_type === "specific_date" && holiday.specific_date && !holiday.workingday) {
        return holiday.specific_date === dateStr
      }
      if (holiday.holiday_type === "day_of_week" && holiday.day_of_week !== null && !holiday.workingday) {
        return holiday.day_of_week === dayOfWeek
      }
      return false
    })

    if (matchingHolidays.length === 0) return null

    // If there are multiple holidays on the same day, join their names
    return matchingHolidays.map((h) => h.name).join(", ")
  }

  // Add a function to get working day name
  const getWorkingDayName = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd")

    const matchingWorkingDays = holidays.filter((holiday) => {
      return holiday.holiday_type === "exception" && holiday.specific_date === dateStr && holiday.workingday === true
    })

    if (matchingWorkingDays.length === 0) return null

    // Return the working day name
    return matchingWorkingDays[0].name
  }

  // Add fetchHolidays function
  const fetchHolidays = async () => {
    try {
      console.log("Fetching holidays from database...")

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
    }
  }

  // Set up a subscription to listen for changes in the tasks table
  useEffect(() => {
    let subscription: any = null

    try {
      subscription = supabase
        .channel("tasks-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (payload) => {
          console.log("Change received!", payload)
          // Refresh tasks when a change is detected
          fetchTasks()
        })
        .subscribe()
    } catch (error) {
      console.error("Error setting up subscription:", error)
    }

    return () => {
      if (subscription) {
        try {
          subscription.unsubscribe()
        } catch (error) {
          console.error("Error unsubscribing:", error)
        }
      }
    }
  }, [])

  // Load tasks from Supabase on component mount
  useEffect(() => {
    fetchTasks()
    fetchHolidays()

    // Set up a refresh interval to keep data in sync
    const refreshInterval = setInterval(() => {
      fetchTasks()
    }, 30000) // Refresh every 30 seconds

    // Clean up interval on unmount
    return () => clearInterval(refreshInterval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty dependency array ensures this only runs once on mount

  const fetchTasks = useCallback(async () => {
    // Prevent concurrent refreshes
    if (isRefreshingRef.current) return

    try {
      setIsRefreshing(true)
      isRefreshingRef.current = true
      console.log("Fetching tasks from database...")

      const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false })

      if (error) {
        console.error("Error fetching tasks:", error)
        toast({
          title: "Database Error",
          description: "Failed to fetch tasks from database.",
          variant: "destructive",
        })
        setIsRefreshing(false)
        isRefreshingRef.current = false
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
        }))

        // Only update if tasks have changed
        if (JSON.stringify(transformedTasks) !== JSON.stringify(prevTasksRef.current)) {
          prevTasksRef.current = transformedTasks
          setTasks(transformedTasks)
        }
      } else {
        // If no tasks found, set empty array
        setTasks([])
        prevTasksRef.current = []
      }
    } catch (error) {
      console.error("Error loading tasks from Supabase:", error)
      toast({
        title: "Database Error",
        description: "Failed to connect to database.",
        variant: "destructive",
      })
    } finally {
      setIsRefreshing(false)
      // Use setTimeout to ensure the flag is reset even if there's an error
      setTimeout(() => {
        isRefreshingRef.current = false
      }, 0)
    }
  }, [toast])

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))

  // Toggle hide completed tasks
  const toggleHideCompleted = () => {
    setHideCompleted(!hideCompleted)
  }

  // Generate days for the current month
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Get day of week for the first day of the month (0 = Sunday, 6 = Saturday)
  const startDay = monthStart.getDay()

  // Generate blank days to fill in the start of the calendar
  const blankDays = Array(startDay).fill(null)

  // Get tasks due on a specific date - memoized with useCallback
  const getTasksDueOnDate = useCallback(
    (date: Date) => {
      return tasks.filter((task) => {
        const dueDate = parseISO(task.dueDate)
        // Filter out completed tasks if hideCompleted is true
        if (hideCompleted && task.status === "Completed") {
          return false
        }
        return isSameDay(dueDate, date)
      })
    },
    [tasks, hideCompleted],
  )

  // Get completed tasks due on a specific date - memoized with useCallback
  const getCompletedTasksDueOnDate = useCallback(
    (date: Date) => {
      return tasks.filter((task) => {
        const dueDate = parseISO(task.dueDate)
        return isSameDay(dueDate, date) && task.status === "Completed"
      })
    },
    [tasks],
  )

  // Modify the getBackgroundColor function to highlight found dates
  const getBackgroundColor = (taskCount: number, isToday: boolean, date: Date) => {
    // If this is the highlighted date from search, return yellow
    if (highlightedDate && isSameDay(date, highlightedDate)) {
      return "bg-yellow-200"
    }

    // If this is a working day exception, return yellow background
    if (isWorkingDay(date)) {
      return "bg-yellow-100"
    }

    // If this is a holiday, return grey background
    if (isHoliday(date)) {
      return "bg-gray-100"
    }

    if (isToday) return "bg-blue-50"
    if (taskCount === 0) return "bg-white" // Changed from "bg-gray-50" to "bg-white"
    if (taskCount === 1) return "bg-red-50"
    if (taskCount === 2) return "bg-red-100"
    if (taskCount === 3) return "bg-red-200"
    if (taskCount <= 5) return "bg-red-300"
    return "bg-red-400" // More than 5 tasks
  }

  // Get border color based on number of tasks due
  const getBorderColor = (taskCount: number, isToday: boolean) => {
    if (isToday) return "border-blue-300"
    if (taskCount === 0) return "border-gray-200"
    if (taskCount === 1) return "border-red-100"
    if (taskCount === 2) return "border-red-200"
    if (taskCount === 3) return "border-red-300"
    if (taskCount <= 5) return "border-red-400"
    return "border-red-500" // More than 5 tasks
  }

  // Handle task click
  const handleTaskClick = (task: Task) => {
    setSelectedTask({ ...task })
    setIsPanelOpen(true)
  }

  // Handle date box click
  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    setShowCompletedTasks(true)
  }

  // Save edited task
  const saveTask = useCallback(
    async (updatedTask: Task) => {
      // Calculate holiday dates
      const taskStart = parseISO(updatedTask.startDate)
      const taskEnd = parseISO(updatedTask.endDate)

      // Prepare base update data with columns that definitely exist
      const updateData: any = {
        order_number: updatedTask.orderNumber,
        order_name: updatedTask.orderName,
        start_date: updatedTask.startDate,
        end_date: updatedTask.endDate,
        due_date: updatedTask.dueDate,
        notes: updatedTask.notes,
        color: updatedTask.color,
        effort: updatedTask.effort,
        row: updatedTask.row,
        customer_name: updatedTask.customerName,
        phone_number: updatedTask.phoneNumber,
        status: updatedTask.status,
        updated_at: new Date().toISOString(),
        holiday_dates: updatedTask.holidayDates,
        // Always include days_to_complete in the update data
        days_to_complete: updatedTask.daysToComplete,
      }

      // Update task in Supabase with the appropriate fields
      const { error } = await supabase.from("tasks").update(updateData).eq("id", updatedTask.id)

      if (error) {
        console.error("Error updating task in database:", error)
        toast({
          title: "Database Error",
          description: "Failed to save to database, but task was updated locally.",
          variant: "warning",
        })
      } else {
        // Generate change details for logging
        const changeDetails = generateChangeDetails(originalTask, updatedTask)

        // Try to save log to Supabase
        await supabase.from("logs").insert({
          timestamp: new Date().toISOString(),
          action_type: "modified",
          task_id: updatedTask.id,
          order_number: updatedTask.orderNumber,
          order_name: updatedTask.orderName,
          details: changeDetails,
          user_name: "User",
        })

        // Also save to localStorage for backward compatibility
        const logEntry = createLogEntry("modified", updatedTask, changeDetails)
        saveLog(logEntry)
      }

      setTasks(tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)))
      setIsPanelOpen(false)
      setSelectedTask(null)
    },
    [tasks],
  )

  // Get status color class
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

  // Change the handleSearch function to use exact matching instead of includes()
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

    // If we found a match, set the highlighted date to the due date of the first match
    if (matchingTasks.length > 0) {
      const firstMatch = matchingTasks[0]
      const dueDate = parseISO(firstMatch.dueDate)
      setHighlightedDate(dueDate)
      setSelectedDate(dueDate)

      // Scroll to the month containing the due date
      setCurrentMonth(dueDate)

      // Show a toast notification
      toast({
        title: "Order Found",
        description: `Found order ${firstMatch.orderNumber}: ${firstMatch.orderName}`,
      })

      // Scroll the calendar to bring the date into view (with a slight delay to ensure rendering)
      setTimeout(() => {
        const dateElements = document.querySelectorAll("[data-date]")
        for (const element of dateElements) {
          if (element.getAttribute("data-date") === format(dueDate, "yyyy-MM-dd")) {
            element.scrollIntoView({ behavior: "smooth", block: "center" })
            break
          }
        }
      }, 100)
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
    const handleClickOutside = () => {
      if (highlightedDate) {
        setHighlightedDate(null)
        setFoundOrderIds(new Set())
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [highlightedDate])

  return (
    <div className="container mx-auto py-6">
      <div className="flex gap-4">
        {/* Main calendar container - larger and positioned on the left */}
        <Card className="p-4 w-full max-w-5xl">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-bold">Due Dates Calendar</h1>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={prevMonth}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <div className="text-sm font-medium px-2">{format(currentMonth, "MMMM yyyy")}</div>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={nextMonth}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchTasks}
                className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white ml-2 h-7 text-xs"
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
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
              <div className="relative w-48 ml-2">
                <div className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Search className="h-3.5 w-3.5" />
                </div>
                <Input
                  placeholder="Search order ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-7 h-7 text-xs"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSearch}
                className="ml-1 h-7 text-xs px-2"
                disabled={!searchQuery.trim()}
              >
                Find
              </Button>
            </div>
          </div>

          {/* Calendar grid - made larger */}
          <div className="overflow-y-auto max-h-[650px]">
            <div className="grid grid-cols-7 gap-2">
              {/* Day headers - sticky */}
              <div className="col-span-7 grid grid-cols-7 sticky top-0 z-10 bg-white pb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-center font-medium text-sm py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Blank days */}
              {blankDays.map((_, index) => (
                <div key={`blank-${index}`} className="h-28 border rounded-md bg-white"></div> // Changed from "bg-gray-50" to "bg-white"
              ))}

              {/* Days with tasks */}
              {daysInMonth.map((day) => {
                const tasksDue = getTasksDueOnDate(day)
                const completedTasksDue = getCompletedTasksDueOnDate(day)
                const taskCount = tasksDue.length
                const completedCount = completedTasksDue.length
                const isToday = isSameDay(day, new Date())
                const visibleTasks = tasksDue.slice(0, MAX_TASKS_TO_DISPLAY)
                const hiddenTasksCount = Math.max(0, taskCount - MAX_TASKS_TO_DISPLAY)
                const isSelected = selectedDate && isSameDay(selectedDate, day)
                const holidayName = isHoliday(day) ? getHolidayName(day) : null
                const workingDayName = isWorkingDay(day) ? getWorkingDayName(day) : null

                return (
                  <div
                    key={day.toString()}
                    data-date={format(day, "yyyy-MM-dd")}
                    className={cn(
                      "h-28 border rounded-md p-1 overflow-hidden cursor-pointer hover:border-blue-400",
                      getBorderColor(taskCount, isToday),
                      getBackgroundColor(taskCount, isToday, day),
                      isSelected && "ring-2 ring-blue-500",
                    )}
                    onClick={(e) => {
                      // Check if this is a holiday and show toast if it is
                      if (isHoliday(day)) {
                        toast({
                          title: "Holiday",
                          description: getHolidayName(day),
                        })
                      } else if (isWorkingDay(day)) {
                        toast({
                          title: "Working Day Exception",
                          description: getWorkingDayName(day),
                        })
                      }

                      // Then handle the regular date click
                      handleDateClick(day)
                    }}
                  >
                    <div className={cn("text-right text-sm mb-1 font-medium", isToday && "text-blue-600")}>
                      {isHoliday(day) ? (
                        <span className="flex items-center justify-end">
                          <span className="inline-block w-2 h-2 rounded-full bg-gray-400 mr-1"></span>
                          {format(day, "d")}
                          {taskCount > 0 && <span className="ml-1 text-xs font-bold text-gray-700">({taskCount})</span>}
                        </span>
                      ) : isWorkingDay(day) ? (
                        <span className="flex items-center justify-end">
                          <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1"></span>
                          {format(day, "d")}
                          {taskCount > 0 && <span className="ml-1 text-xs font-bold text-gray-700">({taskCount})</span>}
                        </span>
                      ) : (
                        <span>
                          {format(day, "d")}
                          {taskCount > 0 && <span className="ml-1 text-xs font-bold text-gray-700">({taskCount})</span>}
                        </span>
                      )}
                    </div>

                    <div className="space-y-0.5 overflow-y-auto max-h-[calc(100%-20px)]">
                      {visibleTasks.map((task) => (
                        <TooltipProvider key={task.id}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "text-xs px-1.5 py-0.5 rounded truncate text-white flex items-center",
                                  task.color,
                                  // Grey out completed tasks
                                  task.status === "Completed" && "opacity-60 grayscale",
                                  // Highlight found tasks
                                  foundOrderIds.has(task.id) && "ring-2 ring-yellow-400 ring-offset-1",
                                )}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleTaskClick(task)
                                }}
                              >
                                <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(task.status)} mr-1`}></div>
                                <span className="font-bold truncate text-[10px]">{task.orderNumber}</span>
                              </div>
                            </TooltipTrigger>
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
                                  <strong>Start:</strong> {format(parseISO(task.startDate), "MMM d")}
                                </div>
                                <div>
                                  <strong>End:</strong> {format(parseISO(task.endDate), "MMM d")}
                                </div>
                                <div>
                                  <strong className="text-red-500">Due:</strong>{" "}
                                  <span className="text-red-500 font-medium">
                                    {format(parseISO(task.dueDate), "MMM d")}
                                  </span>
                                </div>
                                {task.status === "Completed" && (
                                  <div className="text-green-600 font-medium flex items-center">
                                    <Check className="h-3 w-3 mr-1" /> Completed
                                  </div>
                                )}
                                {task.notes && (
                                  <div className="border-t pt-1 mt-1">
                                    <strong>Notes:</strong> <span className="text-gray-700">{task.notes}</span>
                                  </div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))}

                      {hiddenTasksCount > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="text-[10px] px-1 py-0.5 rounded bg-gray-200 text-gray-800 font-medium cursor-pointer hover:bg-gray-300">
                                +{hiddenTasksCount} more
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="space-y-1">
                                <div className="font-medium border-b pb-1 mb-1">Hidden tasks:</div>
                                {tasksDue.slice(MAX_TASKS_TO_DISPLAY).map((task) => (
                                  <div key={task.id} className="flex gap-1">
                                    <span className={cn("w-2 h-2 rounded-full mt-1.5", task.color)}></span>
                                    <span>
                                      <strong>{task.orderNumber}:</strong> {task.orderName}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legend for calendar colors */}
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-center gap-4 text-xs">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded mr-1"></div>
                <span>Holiday</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-yellow-100 border border-yellow-300 rounded mr-1"></div>
                <span>Working Day</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-50 border border-blue-300 rounded mr-1"></div>
                <span>Today</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-white border border-gray-300 rounded mr-1"></div>
                <span>Regular Day</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Task Edit Panel - with reduced gap */}
        {isPanelOpen && (
          <div className="w-[350px]">
            <TaskPanel
              task={selectedTask}
              isOpen={isPanelOpen}
              onClose={() => {
                setIsPanelOpen(false)
                setSelectedTask(null)
              }}
              onSave={saveTask}
              allTasks={tasks} // Pass all tasks to the panel
              holidays={holidays} // Pass holidays to the panel
            />
          </div>
        )}
      </div>
    </div>
  )
}
