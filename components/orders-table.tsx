"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import type React from "react"

import { format, parseISO, isAfter, differenceInDays, addDays, isBefore } from "date-fns"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { CalendarIcon, Search, Eye, Pencil, Trash2, EyeOff, AlertCircle } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Calendar } from "@/components/ui/calendar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// Add this import at the top of the file if it's using effortOptions
import { statusOptions } from "./calendar-with-tasks"
// Define our own effort options
const effortOptions = [25, 33.33, 50, 75]
import type { Task } from "@/components/calendar-with-tasks"
import { createLogEntry, saveLog } from "@/utils/history-logger"
import { supabase } from "@/lib/supabase"

// Add the xlsx import at the top of the file, with the other imports
import * as XLSX from "xlsx"

// Add the Holiday type import at the top of the file:
import type { Holiday } from "@/app/actions/holiday-actions"

// Update the interface to include the new prop
interface OrdersTableProps {
  tasks: Task[]
  setTasks: (tasks: Task[]) => void
  maxHeight?: number
  hideExcelDownload?: boolean
  hideCompletedToggle?: boolean // Add this new prop
  holidays?: Holiday[] // Add this line to include holidays
}

// Add this validation function near the top of the file, before the OrdersTable component
function validateTaskDuration(startDate: string, endDate: string): { valid: boolean; message?: string } {
  if (!startDate || !endDate) {
    return {
      valid: false,
      message: "Start date and end date are required.",
    }
  }

  try {
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
  } catch (error) {
    console.error("Error validating task duration:", error)
    return {
      valid: false,
      message: "Invalid date format.",
    }
  }
}

// Add this function near the top of the file, after the validateTaskDuration function
function isTaskCompleted(task: Task): boolean {
  return task.status === "Completed"
}

// Add a function to calculate working days between two dates
const calculateWorkingDays = (startDate: Date, endDate: Date): { workingDays: number; holidayCount: number } => {
  const totalDays = differenceInDays(endDate, startDate) + 1
  let holidayCount = 0

  for (let i = 0; i < totalDays; i++) {
    const currentDate = addDays(startDate, i)
    // Simple holiday check (weekends) - in a real implementation, use the isHoliday function
    const dayOfWeek = currentDate.getDay()
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // 0 = Sunday, 6 = Saturday
      holidayCount++
    }
  }

  return {
    workingDays: totalDays - holidayCount,
    holidayCount,
  }
}

// Add holiday count mismatch warning to table cells
// Locate the Status cell in the table and add an error indicator

// Add this function to check if a task has a holiday count mismatch
const hasHolidayCountMismatch = (task: Task) => {
  if (task.numberOfHolidays === undefined || !task.startDate || !task.endDate) return false

  try {
    const startDate = parseISO(task.startDate)
    const endDate = parseISO(task.endDate)

    // Count holidays between dates using a simplified version
    let holidayCount = 0
    const totalDays = differenceInDays(endDate, startDate) + 1

    // This is a simplified approach - in production code, we would use the same isHoliday function
    for (let i = 0; i < totalDays; i++) {
      const currentDate = addDays(startDate, i)
      const dayOfWeek = currentDate.getDay()
      // Consider weekends as holidays for this example - adjust based on your holiday logic
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        holidayCount++
      }
    }

    return task.numberOfHolidays !== holidayCount
  } catch (error) {
    console.error("Error in hasHolidayCountMismatch:", error)
    return false
  }
}

// Update the function signature to include the new prop with a default value
export function OrdersTable({
  tasks,
  setTasks,
  maxHeight,
  hideExcelDownload = false,
  hideCompletedToggle = false,
  holidays = [], // Add default empty array for holidays
}: OrdersTableProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [originalTask, setOriginalTask] = useState<Task | null>(null) // Store original task for comparison
  const [viewingTask, setViewingTask] = useState<Task | null>(null)
  const [daysToComplete, setDaysToComplete] = useState<number>(1)
  const [sortColumn, setSortColumn] = useState<keyof Task>("orderNumber")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [searchQuery, setSearchQuery] = useState("")
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([])
  const { toast } = useToast()
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [isEditingInModal, setIsEditingInModal] = useState(false)
  const [isCustomEffort, setIsCustomEffort] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [hideCompleted, setHideCompleted] = useState(false)

  // Add a ref to track if the component is mounted
  const isMounted = useRef(true)

  // Add a ref to track if initial filtering has been done
  const initialFilterDone = useRef(false)

  // Add a ref to track the last tasks array to prevent unnecessary updates
  const lastTasksRef = useRef<Task[]>([])

  // Set isMounted to false when component unmounts
  useEffect(() => {
    // Set mounted flag to true when component mounts
    isMounted.current = true

    return () => {
      // Set mounted flag to false when component unmounts
      isMounted.current = false
    }
  }, [])

  // Add a ref to track if we're currently refreshing tasks
  const isRefreshingRef = useRef(false)

  // Update the refreshTasks function to prevent concurrent refreshes
  const refreshTasks = useCallback(async () => {
    // Don't proceed if component is unmounted
    if (!isMounted.current) return

    // Don't refresh if already refreshing
    if (isRefreshing || isRefreshingRef.current) return

    try {
      setIsRefreshing(true)
      isRefreshingRef.current = true
      console.log("Refreshing tasks from database...")

      // Check if supabase client is available
      if (!supabase) {
        console.error("Supabase client is not initialized")
        if (isMounted.current) {
          setIsRefreshing(false)
          isRefreshingRef.current = false
          toast({
            title: "Database Error",
            description: "Database connection not available.",
            variant: "destructive",
          })
        }
        return
      }

      const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false })

      if (error) {
        console.error("Error fetching tasks:", error)
        if (isMounted.current) {
          toast({
            title: "Database Error",
            description: "Failed to fetch tasks from database.",
            variant: "destructive",
          })
          setIsRefreshing(false)
          isRefreshingRef.current = false
        }
        return
      }

      if (data && data.length > 0 && isMounted.current) {
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

        // Update the tasks in the parent component only if they've changed
        if (JSON.stringify(transformedTasks) !== JSON.stringify(lastTasksRef.current)) {
          lastTasksRef.current = transformedTasks
          setTasks(transformedTasks)
        }
      }

      if (isMounted.current) {
        setIsRefreshing(false)
        isRefreshingRef.current = false
      }
    } catch (error) {
      console.error("Error refreshing tasks from database:", error)
      if (isMounted.current) {
        toast({
          title: "Database Error",
          description: "Failed to refresh tasks from database.",
          variant: "destructive",
        })
        setIsRefreshing(false)
        isRefreshingRef.current = false
      }
    }
  }, [toast, setTasks, isRefreshing]) // Add isRefreshing to dependencies

  // Add event listeners to refresh tasks when a new task is created or updated
  // Update the useEffect that sets up the subscription

  // Set up a subscription to listen for changes in the tasks table
  useEffect(() => {
    let subscription: any = null

    if (supabase) {
      try {
        subscription = supabase
          .channel("tasks-changes")
          .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (payload) => {
            console.log("Change received!", payload)
            // Refresh tasks when a change is detected
            if (isMounted.current) {
              refreshTasks()
            }
          })
          .subscribe()
      } catch (error) {
        console.error("Error setting up subscription:", error)
      }
    }

    // Set up event listeners for task updates
    const handleTaskCreated = () => {
      console.log("Task created event received in orders table, refreshing tasks")
      if (isMounted.current) {
        refreshTasks()
      }
    }

    const handleTasksUpdated = () => {
      console.log("Tasks updated event received in orders table, refreshing tasks")
      if (isMounted.current) {
        refreshTasks()
      }
    }

    // Add event listeners
    window.addEventListener("task-created", handleTaskCreated)
    window.addEventListener("tasks-updated", handleTasksUpdated)

    return () => {
      if (subscription) {
        try {
          subscription.unsubscribe()
        } catch (error) {
          console.error("Error unsubscribing:", error)
        }
      }

      // Remove event listeners
      window.removeEventListener("task-created", handleTaskCreated)
      window.removeEventListener("tasks-updated", handleTasksUpdated)
    }
  }, [refreshTasks]) // Only depend on refreshTasks

  // Set up a refresh interval with proper cleanup
  useEffect(() => {
    // Set up a refresh interval to keep data in sync
    const refreshInterval = setInterval(() => {
      if (isMounted.current) {
        refreshTasks()
      }
    }, 30000) // Refresh every 30 seconds

    // Clean up interval on unmount
    return () => {
      clearInterval(refreshInterval)
    }
  }, [refreshTasks])

  // Fix the useEffect for filtering tasks
  // The issue is in this useEffect - it has a circular dependency with filteredTasks
  // Let's modify it to properly handle the hideCompleted state change

  // Fix the useEffect for filtering tasks
  useEffect(() => {
    // Skip if component is unmounted
    if (!isMounted.current) return

    // Filter the tasks based on current criteria
    const filterTasks = () => {
      // Skip if component is unmounted
      if (!isMounted.current) return

      let filtered = [...tasks]

      // Apply hide completed filter
      if (hideCompleted) {
        filtered = filtered.filter((task) => task.status !== "Completed")
      }

      // Apply search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        filtered = filtered.filter((task) => {
          return (
            task.orderNumber.toLowerCase().includes(query) ||
            task.orderName.toLowerCase().includes(query) ||
            (task.customerName && task.customerName.toLowerCase().includes(query)) ||
            (task.phoneNumber && task.phoneNumber.toLowerCase().includes(query)) ||
            task.notes.toLowerCase().includes(query) ||
            task.status.toLowerCase().includes(query)
          )
        })
      }

      // Update filtered tasks
      setFilteredTasks(filtered)

      // Mark initial filtering as done
      initialFilterDone.current = true
    }

    filterTasks()
  }, [searchQuery, tasks, hideCompleted]) // Remove filteredTasks from dependencies to avoid circular updates

  // Focus the first input when editing starts
  useEffect(() => {
    if (editingId && inputRefs.current["orderNumber"]) {
      inputRefs.current["orderNumber"].focus()
    }
  }, [editingId])

  // Calculate days to complete when editing starts
  // Replace this useEffect:
  useEffect(() => {
    if (editingTask) {
      // Use the database value directly instead of calculating
      setDaysToComplete(editingTask.daysToComplete)

      // Check if the current effort value is in the predefined options
      setIsCustomEffort(!effortOptions.includes(editingTask.effort))
    }
  }, [editingTask])

  // Modify the startEditing function to prevent editing completed tasks
  const startEditing = (task: Task) => {
    setEditingId(task.id)
    setEditingTask({ ...task })
    setOriginalTask({ ...task }) // Store original task for comparison
    setIsCustomEffort(!effortOptions.includes(task.effort))
  }

  // Cancel editing
  const cancelEditing = () => {
    setEditingId(null)
    setEditingTask(null)
    setOriginalTask(null)
    setIsCustomEffort(false)
  }

  // Update the viewTaskDetails function to initialize editing state
  const viewTaskDetails = (task: Task) => {
    setViewingTask(task)
    setEditingTask({ ...task }) // Initialize editingTask with the current task
    setOriginalTask({ ...task }) // Store original task for comparison
    setIsEditingInModal(false) // Start in view mode, not edit mode
    setIsCustomEffort(!effortOptions.includes(task.effort))

    // Calculate days to complete for the task
    const taskStart = parseISO(task.startDate)
    const taskEnd = parseISO(task.endDate)
    const days = differenceInDays(taskEnd, taskStart) + 1
    setDaysToComplete(days)
  }

  // Update the toggleEditInModal function in the modal view
  const toggleEditInModal = () => {
    setIsEditingInModal(!isEditingInModal)
  }

  // Generate change details for logging
  const generateChangeDetails = (original: Task, updated: Task): string => {
    if (!original || !updated) {
      return "No change details available"
    }

    const changes: string[] = []

    if (original.orderNumber !== updated.orderNumber) {
      changes.push(`Order Number: ${original.orderNumber || "None"} → ${updated.orderNumber || "None"}`)
    }

    if (original.orderName !== updated.orderName) {
      changes.push(`Order Name: ${original.orderName || "None"} → ${updated.orderName || "None"}`)
    }

    if (original.customerName !== updated.customerName) {
      changes.push(`Customer: ${original.customerName || "None"} → ${updated.customerName || "None"}`)
    }

    if (original.status !== updated.status) {
      changes.push(`Status: ${original.status || "None"} → ${updated.status || "None"}`)
    }

    if (original.effort !== updated.effort) {
      changes.push(`Effort: ${original.effort || "None"} → ${updated.effort || "None"}`)
    }

    if (original.startDate !== updated.startDate) {
      try {
        changes.push(
          `Start Date: ${original.startDate ? format(parseISO(original.startDate), "MMM d, yyyy") : "None"} → ${updated.startDate ? format(parseISO(updated.startDate), "MMM d, yyyy") : "None"}`,
        )
      } catch (error) {
        console.error("Error formatting start date:", error)
        changes.push(`Start Date: Changed`)
      }
    }

    if (original.endDate !== updated.endDate) {
      try {
        changes.push(
          `End Date: ${original.endDate ? format(parseISO(original.endDate), "MMM d, yyyy") : "None"} → ${updated.endDate ? format(parseISO(updated.endDate), "MMM d, yyyy") : "None"}`,
        )
      } catch (error) {
        console.error("Error formatting end date:", error)
        changes.push(`End Date: Changed`)
      }
    }

    if (original.dueDate !== updated.dueDate) {
      try {
        changes.push(
          `Due Date: ${original.dueDate ? format(parseISO(original.dueDate), "MMM d, yyyy") : "None"} → ${updated.dueDate ? format(parseISO(updated.dueDate), "MMM d, yyyy") : "None"}`,
        )
      } catch (error) {
        console.error("Error formatting due date:", error)
        changes.push(`Due Date: Changed`)
      }
    }

    if (original.notes !== updated.notes) {
      if ((updated.notes || "").length > 50) {
        changes.push(`Notes updated`)
      } else {
        changes.push(`Notes: "${original.notes || "None"}" → "${updated.notes || "None"}"`)
      }
    }

    return changes.length > 0 ? `Changes: ${changes.join(", ")}` : "No significant changes detected"
  }

  // Add a function to save changes from the modal
  const saveModalChanges = async () => {
    if (!editingTask || !viewingTask || !originalTask) return

    // Validate dates
    const startDate = parseISO(editingTask.startDate)
    const endDate = parseISO(editingTask.endDate)
    const dueDate = parseISO(editingTask.dueDate)

    if (isAfter(endDate, dueDate)) {
      toast({
        title: "Validation Error",
        description: "End date cannot be later than due date",
        variant: "destructive",
      })
      return
    }

    if (isAfter(startDate, endDate)) {
      toast({
        title: "Validation Error",
        description: "Start date cannot be later than end date",
      })
      return
    }

    // Validate task duration
    const durationValidation = validateTaskDuration(editingTask.startDate, editingTask.endDate)
    if (!durationValidation.valid) {
      toast({
        title: "Validation Error",
        description: durationValidation.message,
        variant: "destructive",
      })
      return
    }

    // Check for holiday warnings
    const holidayWarnings = checkHolidayWarnings(editingTask)
    if (holidayWarnings.length > 0) {
      // Show confirmation dialog
      const warningMessage = `This task has the following holiday warnings:\n\n${holidayWarnings.join("\n")}\n\nDo you want to save anyway?`

      if (!confirm(warningMessage)) {
        // User canceled, don't save
        return
      }
    }

    try {
      // Calculate holiday dates between start and end dates
      const holidayDates = getHolidayDatesInRange(startDate, endDate, holidays)
      console.log("Calculated holiday dates for modal save:", holidayDates)

      // Prepare base update data with columns that definitely exist
      const updateData: any = {
        order_number: editingTask.orderNumber,
        order_name: editingTask.orderName,
        start_date: editingTask.startDate,
        end_date: editingTask.endDate,
        due_date: editingTask.dueDate,
        notes: editingTask.notes,
        color: editingTask.color,
        effort: editingTask.effort,
        row: editingTask.row,
        customer_name: editingTask.customerName,
        phone_number: editingTask.phoneNumber,
        status: editingTask.status,
        updated_at: new Date().toISOString(),
        holiday_dates: holidayDates,
        // Always include days_to_complete in the update data
        days_to_complete: editingTask.daysToComplete || daysToComplete,
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
          updateData.days_to_complete = editingTask.daysToComplete || daysToComplete
          updateData.number_of_holidays = holidayDates.length // Use the holiday dates array length
        } else {
          console.log("days_to_complete and number_of_holidays columns don't exist yet, skipping them")
        }
      } catch (columnError) {
        console.log("Error checking for columns, skipping days_to_complete and number_of_holidays")
      }

      // Update task in Supabase
      const { error } = await supabase.from("tasks").update(updateData).eq("id", editingTask.id)

      if (error) {
        console.error("Error updating task:", error)
        toast({
          title: "Error",
          description: "Failed to update task. Please try again.",
          variant: "destructive",
        })
        return
      }

      // Generate change details for logging
      const changeDetails = generateChangeDetails(originalTask, editingTask)

      // Save log to Supabase
      await supabase.from("logs").insert({
        timestamp: new Date().toISOString(),
        action_type: "modified",
        task_id: editingTask.id,
        order_number: editingTask.orderNumber,
        order_name: editingTask.orderName,
        details: changeDetails,
        user_name: "User",
      })

      // Also save to localStorage for backward compatibility
      const logEntry = createLogEntry("modified", editingTask, changeDetails)
      saveLog(logEntry)

      // Update tasks with the holidayDates information
      const updatedTask = {
        ...editingTask,
        holidayDates: holidayDates,
        numberOfHolidays: holidayDates.length,
      }

      const updatedTasks = tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task))
      setTasks(updatedTasks)
      lastTasksRef.current = updatedTasks // Update the ref to prevent unnecessary refreshes

      setViewingTask(updatedTask) // Update the viewing task with the edited values
      setIsEditingInModal(false) // Exit edit mode

      toast({
        title: "Success",
        description: "Task updated successfully",
      })
    } catch (error) {
      console.error("Error updating task:", error)
      toast({
        title: "Error",
        description: "Failed to update task. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Add a function to check for holiday warnings
  const checkHolidayWarnings = (task: Task): string[] => {
    const warnings: string[] = []

    // Fetch holidays from the database
    // Since we can't do this asynchronously in this context, we'll use a simplified approach
    // In a real implementation, you might want to fetch holidays when the component mounts

    try {
      // Check if start date is a holiday
      const startDate = parseISO(task.startDate)
      const startDay = startDate.getDay() // 0 = Sunday, 6 = Saturday

      // Check for weekends as a simple example
      if (startDay === 0 || startDay === 6) {
        warnings.push(`Start date (${format(startDate, "MMM d")}) falls on a weekend`)
      }

      // Check if end date is a holiday
      const endDate = parseISO(task.endDate)
      const endDay = endDate.getDay()

      if (endDay === 0 || endDay === 6) {
        warnings.push(`End date (${format(endDate, "MMM d")}) falls on a weekend`)
      }

      // Check if due date is a holiday
      const dueDate = parseISO(task.dueDate)
      const dueDay = dueDate.getDay()

      if (dueDay === 0 || dueDay === 6) {
        warnings.push(`Due date (${format(dueDate, "MMM d")}) falls on a weekend`)
      }

      return warnings
    } catch (error) {
      console.error("Error checking for holiday warnings:", error)
      return []
    }
  }

  // Add a function to cancel editing in the modal
  const cancelModalEditing = () => {
    if (viewingTask) {
      setEditingTask({ ...viewingTask }) // Reset to original values
      setIsCustomEffort(!effortOptions.includes(viewingTask.effort))
    }
    setIsEditingInModal(false) // Exit edit mode
  }

  // Update the closeTaskDetails function
  const closeTaskDetails = () => {
    setViewingTask(null)
    setIsEditingInModal(false)
    setOriginalTask(null)
    setIsCustomEffort(false)
  }

  // Add this function to calculate holiday dates between two dates
  const getHolidayDatesInRange = (startDate: Date, endDate: Date, holidays: Holiday[]): string[] => {
    if (!startDate || !endDate) return []

    const holidayDates: string[] = []
    const currentDate = new Date(startDate)

    // Loop through each day in the range
    while (currentDate <= endDate) {
      // Check if this day is a holiday using the isHoliday function
      if (isHoliday(currentDate, holidays)) {
        // Add the date in YYYY-MM-DD format
        holidayDates.push(format(currentDate, "yyyy-MM-dd"))
      }
      // Move to the next day
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return holidayDates
  }

  // Update the saveEditing function to properly calculate and save holiday dates
  const saveEditing = async () => {
    if (!editingTask || !originalTask) return

    // Validate dates
    const startDate = parseISO(editingTask.startDate)
    const endDate = parseISO(editingTask.endDate)
    const dueDate = parseISO(editingTask.dueDate)

    if (isAfter(endDate, dueDate)) {
      toast({
        title: "Validation Error",
        description: "End date cannot be later than due date",
      })
      return
    }

    if (isAfter(startDate, endDate)) {
      toast({
        title: "Validation Error",
        description: "Start date cannot be later than end date",
      })
      return
    }

    // Validate task duration
    const durationValidation = validateTaskDuration(editingTask.startDate, editingTask.endDate)
    if (!durationValidation.valid) {
      toast({
        title: "Validation Error",
        description: durationValidation.message,
      })
      return
    }

    // Check for holiday warnings
    const holidayWarnings = checkHolidayWarnings(editingTask)
    if (holidayWarnings.length > 0) {
      // Show confirmation dialog
      const warningMessage = `This task has the following holiday warnings:\n\n${holidayWarnings.join("\n")}\n\nDo you want to save anyway?`

      if (!confirm(warningMessage)) {
        // User canceled, don't save
        return
      }
    }

    try {
      console.log("Saving task to database:", editingTask)

      // Recalculate the start date based on end date and days to complete
      const newEndDate = parseISO(editingTask.endDate)
      let currentDate = newEndDate
      let remainingWorkingDays = daysToComplete

      // Count backwards until we've found enough working days
      while (remainingWorkingDays > 1) {
        // Start with 1 because end date counts as a working day
        // Move one day back
        currentDate = addDays(currentDate, -1)

        // Check if this day is a holiday
        const isHolidayDay = isHoliday(currentDate, holidays)

        // If it's not a holiday, count it as a working day
        if (!isHolidayDay) {
          remainingWorkingDays--
        }
      }

      // The currentDate is now our start date
      const recalculatedStartDate = format(currentDate, "yyyy-MM-dd")

      // Update the editingTask with the recalculated start date
      editingTask.startDate = recalculatedStartDate

      // Calculate holiday dates between start and end dates
      const holidayDates = getHolidayDatesInRange(
        parseISO(editingTask.startDate),
        parseISO(editingTask.endDate),
        holidays,
      )
      console.log("Calculated holiday dates:", holidayDates)

      // Prepare base update data with columns that definitely exist
      const updateData: any = {
        order_number: editingTask.orderNumber,
        order_name: editingTask.orderName,
        start_date: editingTask.startDate,
        end_date: editingTask.endDate,
        due_date: editingTask.dueDate,
        notes: editingTask.notes,
        color: editingTask.color,
        effort: editingTask.effort,
        row: editingTask.row,
        customer_name: editingTask.customerName,
        phone_number: editingTask.phoneNumber,
        status: editingTask.status,
        updated_at: new Date().toISOString(),
        holiday_dates: holidayDates,
        // Always include days_to_complete in the update data
        days_to_complete: editingTask.daysToComplete || daysToComplete,
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
          updateData.days_to_complete = editingTask.daysToComplete || daysToComplete
          updateData.number_of_holidays = holidayDates.length // Use the holiday dates array length
        } else {
          console.log("days_to_complete and number_of_holidays columns don't exist yet, skipping them")
        }
      } catch (columnError) {
        console.log("Error checking for columns, skipping days_to_complete and number_of_holidays")
      }

      // Update task in Supabase
      const { error } = await supabase.from("tasks").update(updateData).eq("id", editingTask.id)

      if (error) {
        console.error("Error updating task in database:", error)
        toast({
          title: "Database Error",
          description: "Failed to update task in database. Please try again.",
          variant: "destructive",
        })
        return
      }

      console.log("Task updated successfully in database")

      // Generate change details for logging
      const changeDetails = generateChangeDetails(originalTask, editingTask)

      // Save log to Supabase
      await supabase.from("logs").insert({
        timestamp: new Date().toISOString(),
        action_type: "modified",
        task_id: editingTask.id,
        order_number: editingTask.orderNumber,
        order_name: editingTask.orderName,
        details: changeDetails,
        user_name: "User",
      })

      // Also save to localStorage for backward compatibility
      const logEntry = createLogEntry("modified", editingTask, changeDetails)
      saveLog(logEntry)

      // Update tasks with the holidayDates information
      const updatedTask = {
        ...editingTask,
        holidayDates: holidayDates,
        numberOfHolidays: holidayDates.length,
      }

      const updatedTasks = tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task))
      setTasks(updatedTasks)
      lastTasksRef.current = updatedTasks // Update the ref to prevent unnecessary refreshes

      setEditingId(null)
      setEditingTask(null)
      setOriginalTask(null)
      setIsCustomEffort(false)

      toast({
        title: "Success",
        description: "Task updated successfully",
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

  // Add a toggleHideCompleted function
  const toggleHideCompleted = () => {
    setHideCompleted(!hideCompleted)
  }

  // Add this function before the return statement
  // Update the isHoliday function to properly check for holidays
  const isHoliday = (date: Date, holidays: Holiday[]): boolean => {
    if (!date) return false

    // First check if it's a weekend (0 = Sunday, 6 = Saturday)
    const dayOfWeek = date.getDay()
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return true
    }

    if (!holidays || !Array.isArray(holidays)) return false

    // Then check if it's in the holidays array
    const dateStr = format(date, "yyyy-MM-dd")

    // Check for specific date holidays
    const isSpecificDateHoliday = holidays.some(
      (holiday) => holiday && holiday.holiday_type === "specific_date" && holiday.specific_date === dateStr,
    )

    // Check for day of week holidays
    const isDayOfWeekHoliday = holidays.some(
      (holiday) => holiday && holiday.holiday_type === "day_of_week" && holiday.day_of_week === dayOfWeek,
    )

    // Check for exceptions (working days that override holidays)
    const isException = holidays.some(
      (holiday) => holiday && holiday.holiday_type === "exception" && holiday.specific_date === dateStr,
    )

    // It's a holiday if it's either a specific date holiday or a day of week holiday,
    // but not if it's an exception
    return (isSpecificDateHoliday || isDayOfWeekHoliday) && !isException
  }

  // Update the updateStartDate function to handle null values:
  const updateStartDate = (endDate: Date, workingDays: number) => {
    if (!editingTask || !endDate) return

    console.log(`Calculating start date for ${workingDays} working days from ${format(endDate, "yyyy-MM-dd")}`)
    console.log(`Using ${holidays?.length || 0} holidays for calculation`)

    // We need to find a start date such that:
    // The number of working days between start and end equals the user input
    // This means we need to count backwards from the end date, skipping holidays

    // For the special case where days = 1, the start date should be the same as the end date
    if (workingDays === 1) {
      const formattedStartDate = format(endDate, "yyyy-MM-dd")

      // Check if the end date itself is a holiday
      const holidayCount = isHoliday(endDate, holidays) ? 1 : 0

      setEditingTask({
        ...editingTask,
        startDate: formattedStartDate,
        daysToComplete: workingDays,
        numberOfHolidays: holidayCount,
      })

      return
    }

    let currentDate = endDate
    let remainingWorkingDays = workingDays
    let holidayCount = 0

    // Count backwards until we've found enough working days
    while (remainingWorkingDays > 1) {
      // Start with 1 because end date counts as a working day
      // Move one day back
      currentDate = addDays(currentDate, -1)

      // Check if this day is a holiday
      if (isHoliday(currentDate, holidays)) {
        holidayCount++
        console.log(`Found holiday on ${format(currentDate, "yyyy-MM-dd")}`)
      } else {
        remainingWorkingDays--
        console.log(`Found working day on ${format(currentDate, "yyyy-MM-dd")}, remaining: ${remainingWorkingDays}`)
      }
    }

    // The currentDate is now our start date
    const formattedStartDate = format(currentDate, "yyyy-MM-dd")
    console.log(`Calculated start date: ${formattedStartDate} with ${holidayCount} holidays`)

    setEditingTask({
      ...editingTask,
      startDate: formattedStartDate,
      daysToComplete: workingDays,
      numberOfHolidays: holidayCount,
    })
  }

  // Update the handleEndDateSelect function to use the improved updateStartDate
  const handleEndDateSelect = (date: Date | undefined) => {
    if (!date || !editingTask) return

    const newEndDate = format(date, "yyyy-MM-dd")

    // Validate that end date is not after due date
    if (isAfter(date, parseISO(editingTask.dueDate))) {
      toast({
        title: "Validation Error",
        description: "End date cannot be later than due date",
        variant: "destructive",
      })
      return
    }

    // Update the end date
    setEditingTask({
      ...editingTask,
      endDate: newEndDate,
    })

    // Recalculate the start date based on the working days
    // This preserves the user's input for working days
    updateStartDate(date, daysToComplete)
  }

  const downloadToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(filteredTasks)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders")
    XLSX.writeFile(workbook, "orders.xlsx")
  }

  const handleSort = (column: keyof Task) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const aValue = a[sortColumn]
    const bValue = b[sortColumn]

    if (typeof aValue === "string" && typeof bValue === "string") {
      return sortDirection === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
    } else if (typeof aValue === "number" && typeof bValue === "number") {
      return sortDirection === "asc" ? aValue - bValue : bValue - aValue
    } else {
      // Handle cases where values are not directly comparable
      return 0
    }
  })

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>, field: string, nextFieldIndex: number) => {
    if (e.key === "Enter") {
      e.preventDefault()
      if (inputRefs.current && inputRefs.current[field]) {
        const nextFieldKeys = Object.keys(inputRefs.current)
        if (nextFieldIndex < nextFieldKeys.length - 1) {
          const nextFieldKey = nextFieldKeys[nextFieldIndex + 1]
          const nextInput = inputRefs.current[nextFieldKey]
          if (nextInput) {
            nextInput.focus()
          }
        } else {
          // If it's the last field, save the changes
          saveEditing()
        }
      }
    }
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Pending":
        return "bg-gray-100 text-gray-800"
      case "In Progress":
        return "bg-blue-100 text-blue-800"
      case "Completed":
        return "bg-green-100 text-green-800"
      case "Cancelled":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  // Update the getDaysToComplete function to prioritize the database value
  const getDaysToComplete = (task: Task): number => {
    // Use the database value if available
    if (task.daysToComplete !== undefined) {
      return task.daysToComplete
    }

    // Only calculate if no database value exists (for backward compatibility)
    if (task.startDate && task.endDate) {
      try {
        const startDate = parseISO(task.startDate)
        const endDate = parseISO(task.endDate)
        return differenceInDays(endDate, startDate) + 1
      } catch (error) {
        console.error("Error calculating days to complete:", error)
        return 1 // Default to 1 day if calculation fails
      }
    }

    return 1 // Default to 1 day if dates are missing
  }

  const deleteTask = async (id: number) => {
    try {
      // Delete task from Supabase
      const { error } = await supabase.from("tasks").delete().eq("id", id)

      if (error) {
        console.error("Error deleting task:", error)
        toast({
          title: "Error",
          description: "Failed to delete task. Please try again.",
          variant: "destructive",
        })
        return
      }

      // Update tasks state
      const updatedTasks = tasks.filter((task) => task.id !== id)
      setTasks(updatedTasks)
      lastTasksRef.current = updatedTasks // Update the ref to prevent unnecessary refreshes

      toast({
        title: "Success",
        description: "Task deleted successfully",
      })
    } catch (error) {
      console.error("Error deleting task:", error)
      toast({
        title: "Error",
        description: "Failed to delete task. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Update the moveTaskToDate function to preserve the days_to_complete value
  // Find the moveTaskToDate function and modify it:

  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const [maxStartDate, setMaxStartDate] = useState<Date | null>(null)
  const [isDbConnected, setIsDbConnected] = useState(true)

  // Move task to a new date
  const moveTaskToDate = async (task: Task, date: Date) => {
    if (!task || !date) {
      console.error("Missing task or date in moveTaskToDate")
      return
    }

    try {
      console.log("Moving task to date:", format(date, "yyyy-MM-dd"))

      // Get the working days from the task (or calculate if not available)
      const workingDays =
        task.daysToComplete ||
        (task.startDate && task.endDate ? differenceInDays(parseISO(task.endDate), parseISO(task.startDate)) + 1 : 1)

      // Set new start date to the date where the user dropped the task
      const newStartDate = format(date, "yyyy-MM-dd")

      // Calculate the new end date based on working days
      // We need to find an end date such that the number of working days equals the original
      let currentDate = date
      let remainingWorkingDays = workingDays - 1 // -1 because the start date counts as a working day

      // Count forward until we've found enough working days
      while (remainingWorkingDays > 0) {
        // Move one day forward
        currentDate = addDays(currentDate, 1)

        // Check if this day is a holiday
        const isHolidayDay = isHoliday(currentDate, holidays)

        // If it's not a holiday, count it as a working day
        if (!isHolidayDay) {
          remainingWorkingDays--
        }
      }

      // The currentDate is now our end date
      const newEndDate = format(currentDate, "yyyy-MM-dd")

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

      // Check if task has a due date before proceeding
      if (!task.dueDate) {
        toast({
          title: "Validation Error",
          description: "Task has no due date",
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
      const holidayDates = getHolidayDatesInRange(date, currentDate, holidays)
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

            // If the query succeeds
          } catch (columnError) {
            console.log("Error checking for columns, skipping days_to_complete and number_of_holidays")
          }

          // Update task in Supabase
          const { error } = await supabase.from("tasks").update(updateData).eq("id", task.id)

          if (error) {
            console.error("Error updating task in database:", error)
            toast({
              title: "Database Error",
              description: "Failed to update task in database. Please try again.",
              variant: "destructive",
            })
            return
          }

          console.log("Task updated successfully in database")

          // Update tasks in local state
          setTasks(tasks.map((t) => (t.id === task.id ? updatedTask : t)))
          lastTasksRef.current = tasks.map((t) => (t.id === task.id ? updatedTask : t)) // Update the ref to prevent unnecessary refreshes

          toast({
            title: "Success",
            description: "Task moved successfully",
          })
        } catch (dbError) {
          console.error("Error updating task in database:", dbError)
          setIsDbConnected(false) // Set database connection status to false
          toast({
            title: "Database Error",
            description: "Failed to update task in database. Please try again later.",
            variant: "destructive",
          })
        }
      } else {
        console.log("Database not connected, skipping update")
      }
    } catch (error) {
      console.error("Error moving task to date:", error)
      toast({
        title: "Error",
        description: "Failed to move task. Please try again.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="bg-white rounded-md shadow h-full flex flex-col">
      <div className="p-3 border-b">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-4">
            {/* Check the SVG in the Excel download button */}
            <Button
              variant="outline"
              onClick={refreshTasks}
              className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white"
              title="Refresh tasks from database"
              size="sm"
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
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              >
                <path d="M21 2v6h-6"></path>
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                <path d="M3 22v-6h6"></path>
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
              </svg>
              Refresh
            </Button>

            {/* Add the hide completed button here with extra debugging */}
            {console.log("hideCompletedToggle value:", hideCompletedToggle)}
            {console.log("hideCompletedToggle type:", typeof hideCompletedToggle)}
            {!hideCompletedToggle && (
              <Button variant="outline" onClick={toggleHideCompleted} className="flex items-center gap-1" size="sm">
                {hideCompleted ? (
                  <>
                    <Eye className="h-4 w-4" /> Show Completed
                  </>
                ) : (
                  <>
                    <EyeOff className="h-4 w-4" /> Hide Completed
                  </>
                )}
              </Button>
            )}

            {!hideExcelDownload && (
              <Button
                variant="outline"
                onClick={downloadToExcel}
                className="flex items-center gap-1"
                disabled={filteredTasks.length === 0}
                size="sm"
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
                  className="h-4 w-4"
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="M8 13h2" />
                  <path d="M8 17h2" />
                  <path d="M14 13h2" />
                  <path d="M14 17h2" />
                </svg>
                Download to Excel
              </Button>
            )}
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search orders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          {filteredTasks.length} {filteredTasks.length === 1 ? "order" : "orders"} found
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-auto" style={{ maxHeight: maxHeight ? `${maxHeight}px` : "100%" }}>
          <Table className="border-collapse w-full">
            <TableHeader className="sticky top-0 bg-white z-10">
              <TableRow>
                <TableHead
                  className="cursor-pointer hover:bg-gray-50 px-2 min-w-[100px] max-w-[100px] text-xs h-8"
                  onClick={() => handleSort("orderNumber")}
                >
                  Order # {sortColumn === "orderNumber" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-gray-50 px-2 text-xs h-8"
                  onClick={() => handleSort("orderName")}
                >
                  Order Name {sortColumn === "orderName" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-gray-50 px-2 text-xs h-8"
                  onClick={() => handleSort("customerName")}
                >
                  Customer {sortColumn === "customerName" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-gray-50 px-2 text-xs h-8"
                  onClick={() => handleSort("phoneNumber")}
                >
                  Phone {sortColumn === "phoneNumber" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                {/* TableCell for Status: */}
                <TableHead
                  className="cursor-pointer hover:bg-gray-50 px-2 text-xs h-8"
                  onClick={() => handleSort("status")}
                >
                  Status {sortColumn === "status" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-gray-50 px-2 text-xs h-8">Days</TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-gray-50 px-2 text-xs h-8"
                  onClick={() => handleSort("startDate")}
                >
                  Start {sortColumn === "startDate" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                {/* End Date */}
                <TableHead
                  className="cursor-pointer hover:bg-gray-50 px-2 text-xs h-8"
                  onClick={() => handleSort("endDate")}
                >
                  End {sortColumn === "endDate" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                {/* Due Date */}
                <TableHead
                  className="cursor-pointer hover:bg-gray-50 px-2 text-xs h-8"
                  onClick={() => handleSort("dueDate")}
                >
                  Due {sortColumn === "dueDate" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-gray-50 px-2 text-xs h-8"
                  onClick={() => handleSort("effort")}
                >
                  Effort {sortColumn === "effort" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead className="px-2 text-xs h-8">Notes</TableHead>
                <TableHead className="px-2 text-xs h-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-gray-500">
                    No orders found. Try adjusting your search.
                  </TableCell>
                </TableRow>
              ) : (
                sortedTasks.map((task, index) => (
                  <TableRow
                    key={task.id}
                    className={cn(
                      editingId === task.id ? "bg-blue-50" : "",
                      index % 2 === 0 ? "bg-white" : "bg-gray-50",
                    )}
                  >
                    {/* Order Number */}
                    <TableCell className="h-[32px] px-2 text-xs">
                      {editingId === task.id ? (
                        <input
                          ref={(el) => (inputRefs.current["orderNumber"] = el)}
                          value={editingTask?.orderNumber}
                          onChange={(e) => setEditingTask({ ...editingTask!, orderNumber: e.target.value })}
                          onKeyDown={(e) => handleKeyPress(e, "orderNumber", 0)}
                          className="w-full h-full bg-transparent border-0 focus:outline-none focus:ring-0 px-0 text-xs"
                          disabled={isTaskCompleted(task)}
                        />
                      ) : (
                        <span className="font-medium">{task.orderNumber}</span>
                      )}
                    </TableCell>

                    {/* Order Name */}
                    <TableCell className="h-[32px] px-2 text-xs">
                      {editingId === task.id ? (
                        <input
                          ref={(el) => (inputRefs.current["orderName"] = el)}
                          value={editingTask?.orderName}
                          onChange={(e) => setEditingTask({ ...editingTask!, orderName: e.target.value })}
                          onKeyDown={(e) => handleKeyPress(e, "orderName", 1)}
                          className="w-full h-full bg-transparent border-0 focus:outline-none focus:ring-0 px-0 text-xs"
                          disabled={isTaskCompleted(task)}
                        />
                      ) : (
                        task.orderName
                      )}
                    </TableCell>

                    {/* Customer Name */}
                    <TableCell className="h-[32px] px-2 text-xs">
                      {editingId === task.id ? (
                        <input
                          ref={(el) => (inputRefs.current["customerName"] = el)}
                          value={editingTask?.customerName || ""}
                          onChange={(e) => setEditingTask({ ...editingTask!, customerName: e.target.value })}
                          onKeyDown={(e) => handleKeyPress(e, "customerName", 2)}
                          className="w-full h-full bg-transparent border-0 focus:outline-none focus:ring-0 px-0 text-xs"
                          disabled={isTaskCompleted(task)}
                        />
                      ) : (
                        task.customerName || "-"
                      )}
                    </TableCell>

                    {/* Phone Number */}
                    <TableCell className="h-[32px] px-2 text-xs">
                      {editingId === task.id ? (
                        <input
                          ref={(el) => (inputRefs.current["phoneNumber"] = el)}
                          value={editingTask?.phoneNumber || ""}
                          onChange={(e) => setEditingTask({ ...editingTask!, phoneNumber: e.target.value })}
                          onKeyDown={(e) => handleKeyPress(e, "phoneNumber", 3)}
                          className="w-full h-full bg-transparent border-0 focus:outline-none focus:ring-0 px-0 text-xs"
                          disabled={isTaskCompleted(task)}
                        />
                      ) : (
                        task.phoneNumber || "-"
                      )}
                    </TableCell>

                    {/* Status */}
                    <TableCell className="h-[32px] px-2 text-xs">
                      {editingId === task.id ? (
                        <select
                          ref={(el) => (inputRefs.current["status"] = el as unknown as HTMLInputElement)}
                          value={editingTask?.status}
                          onChange={(e) => setEditingTask({ ...editingTask!, status: e.target.value })}
                          onKeyDown={(e) => handleKeyPress(e, "status", 4)}
                          className="w-full h-full bg-transparent border-0 focus:outline-none focus:ring-0 px-0 text-xs"
                          style={{ appearance: "none" }}
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                              getStatusBadgeClass(task.status),
                            )}
                          >
                            {task.status}
                          </span>
                          {/* Add error icon for holiday count mismatch */}
                          {hasHolidayCountMismatch(task) && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertCircle className="h-3.5 w-3.5 text-red-500 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-xs">
                                    <p className="font-semibold">Holiday count outdated</p>
                                    <p>This task needs holiday count updates due to holiday changes</p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      )}
                    </TableCell>

                    {/* Days to Complete */}
                    <TableCell className="h-[32px] px-2 text-xs">
                      {editingId === task.id ? (
                        // Update the days to complete input handler to use the improved updateStartDate function
                        <input
                          ref={(el) => (inputRefs.current["daysToComplete"] = el)}
                          type="number"
                          min="1"
                          value={daysToComplete?.toString() || "1"}
                          onChange={(e) => {
                            const inputValue = e.target.value
                            const days = inputValue === "" ? 1 : Math.max(1, Number.parseInt(inputValue) || 1)
                            setDaysToComplete(days)

                            // Only recalculate start date if we have a valid days value
                            if (editingTask) {
                              const endDate = parseISO(editingTask.endDate)
                              updateStartDate(endDate, days)
                            }
                          }}
                          onKeyDown={(e) => handleKeyPress(e, "daysToComplete", 5)}
                          className="w-full h-full bg-transparent border-0 focus:outline-none focus:ring-0 px-0 text-xs"
                          disabled={isTaskCompleted(task)}
                        />
                      ) : (
                        // Display the database value or calculate if not available
                        <span>{task.daysToComplete || getDaysToComplete(task)}</span>
                      )}
                    </TableCell>

                    {/* Start Date */}
                    <TableCell className="h-[32px] px-2 text-xs text-gray-500">
                      {editingId === task.id
                        ? format(parseISO(editingTask!.startDate), "MM/dd/yy")
                        : task.startDate
                          ? format(parseISO(task.startDate), "MM/dd/yy")
                          : "-"}
                    </TableCell>

                    {/* End Date */}
                    <TableCell className="h-[32px] px-2 text-xs">
                      {editingId === task.id ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              ref={(el) => (inputRefs.current["endDate"] = el as unknown as HTMLInputElement)}
                              className={`w-full h-full text-left bg-transparent border-0 focus:outline-none focus:ring-0 flex items-center px-0 text-xs ${isTaskCompleted(task) ? "cursor-not-allowed opacity-60" : ""}`}
                              onKeyDown={(e) => handleKeyPress(e, "endDate", 6)}
                              disabled={isTaskCompleted(task)}
                            >
                              {format(parseISO(editingTask?.endDate || task.endDate), "MM/dd/yy")}
                              <CalendarIcon className="ml-1 h-3 w-3 text-gray-500" />
                            </button>
                          </PopoverTrigger>
                          {!isTaskCompleted(task) && (
                            <PopoverContent className="w-auto p-0 z-50">
                              <Calendar
                                mode="single"
                                selected={parseISO(editingTask?.endDate || task.endDate)}
                                onSelect={(date) => {
                                  if (date) handleEndDateSelect(date)
                                }}
                                initialFocus
                                defaultMonth={parseISO(editingTask?.endDate || task.endDate)}
                              />
                            </PopoverContent>
                          )}
                        </Popover>
                      ) : task.endDate ? (
                        format(parseISO(task.endDate), "MM/dd/yy")
                      ) : (
                        "-"
                      )}
                    </TableCell>

                    {/* Due Date */}
                    <TableCell className="h-[32px] px-2 text-xs">
                      {editingId === task.id ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              ref={(el) => (inputRefs.current["dueDate"] = el as unknown as HTMLInputElement)}
                              className={`w-full h-full text-left bg-transparent border-0 focus:outline-none focus:ring-0 flex items-center px-0 text-xs ${isTaskCompleted(task) ? "cursor-not-allowed opacity-60" : ""}`}
                              onKeyDown={(e) => handleKeyPress(e, "dueDate", 7)}
                              disabled={isTaskCompleted(task)}
                            >
                              {format(parseISO(editingTask?.dueDate || task.dueDate), "MM/dd/yy")}
                              <CalendarIcon className="ml-1 h-3 w-3 text-gray-500" />
                            </button>
                          </PopoverTrigger>
                          {!isTaskCompleted(task) && (
                            <PopoverContent className="w-auto p-0 z-50">
                              <Calendar
                                mode="single"
                                selected={parseISO(editingTask?.dueDate || task.dueDate)}
                                onSelect={(date) => {
                                  if (!date || !editingTask) return

                                  const newDueDate = format(date, "yyyy-MM-dd")

                                  // Validate that due date is not before end date
                                  if (isBefore(date, parseISO(editingTask.endDate))) {
                                    toast({
                                      title: "Validation Error",
                                      description: "Due date cannot be before end date",
                                      variant: "destructive",
                                    })
                                    return
                                  }

                                  // Update the editing task
                                  setEditingTask({
                                    ...editingTask,
                                    dueDate: newDueDate,
                                  })
                                }}
                                initialFocus
                                defaultMonth={parseISO(editingTask?.dueDate || task.dueDate)}
                              />
                            </PopoverContent>
                          )}
                        </Popover>
                      ) : task.dueDate ? (
                        format(parseISO(task.dueDate), "MM/dd/yy")
                      ) : (
                        "-"
                      )}
                    </TableCell>

                    {/* Effort */}
                    <TableCell className="h-[32px] px-2 text-xs">
                      {editingId === task.id ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              ref={(el) => (inputRefs.current["effort"] = el as unknown as HTMLInputElement)}
                              className={`w-full h-full text-left bg-transparent border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 flex items-center justify-between text-xs ${isTaskCompleted(task) ? "cursor-not-allowed opacity-60" : ""}`}
                              onKeyDown={(e) => handleKeyPress(e, "effort", 8)}
                              disabled={isTaskCompleted(task)}
                            >
                              {editingTask?.effort?.toString() || "0"}
                              <CalendarIcon className="ml-1 h-3 w-3 text-gray-500" />
                            </button>
                          </PopoverTrigger>
                          {!isTaskCompleted(task) && (
                            <PopoverContent className="w-auto p-2">
                              <div className="flex flex-col gap-2">
                                <div className="flex flex-wrap gap-1">
                                  {effortOptions.map((option) => (
                                    <Button
                                      key={option}
                                      type="button"
                                      size="sm"
                                      variant={editingTask?.effort === option ? "default" : "outline"}
                                      onClick={() => {
                                        setEditingTask({ ...editingTask!, effort: option })
                                        document.body.click() // Close the popover
                                      }}
                                      disabled={viewingTask?.status === "Completed"}
                                    >
                                      {option}
                                    </Button>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={
                                      !effortOptions.includes(editingTask?.effort || 0) &&
                                      editingTask?.effort !== undefined
                                        ? editingTask.effort
                                        : ""
                                    }
                                    onChange={(e) => {
                                      const value = Number.parseFloat(e.target.value)
                                      if (!isNaN(value)) {
                                        setEditingTask({ ...editingTask!, effort: value })
                                      } else {
                                        setEditingTask({ ...editingTask!, effort: "" })
                                      }
                                    }}
                                    className="h-7 text-xs"
                                    placeholder="Custom value"
                                    disabled={viewingTask?.status === "Completed"}
                                  />
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => document.body.click()} // Close the popover
                                    disabled={viewingTask?.status === "Completed"}
                                  >
                                    Apply
                                  </Button>
                                </div>
                              </div>
                            </PopoverContent>
                          )}
                        </Popover>
                      ) : (
                        task.effort?.toString() || "-"
                      )}
                    </TableCell>

                    {/* Notes */}
                    <TableCell className="h-[32px] px-2 text-xs">
                      {editingId === task.id ? (
                        <input
                          ref={(el) => (inputRefs.current["notes"] = el)}
                          value={editingTask?.notes || ""}
                          onChange={(e) => setEditingTask({ ...editingTask!, notes: e.target.value })}
                          onKeyDown={(e) => handleKeyPress(e, "notes", 9)}
                          className="w-full h-full bg-transparent border-0 focus:outline-none focus:ring-0 px-0 text-xs"
                          disabled={isTaskCompleted(task)}
                        />
                      ) : (
                        <div
                          className="line-clamp-2 max-w-[150px] text-xs"
                          title={task.notes || "-"}
                          style={{ minHeight: "2.5em" }}
                        >
                          {task.notes || "-"}
                        </div>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="h-[32px] px-2 text-xs">
                      {editingId === task.id ? (
                        <div className="flex gap-1">
                          <Button size="sm" onClick={() => saveEditing()} className="h-6 text-[10px]" type="button">
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => cancelEditing()}
                            className="h-6 text-[10px]"
                            type="button"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => viewTaskDetails(task)}
                            className="h-6 w-6"
                            title="View Details"
                            type="button"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => startEditing(task)}
                            className="h-6 w-6"
                            title="Edit"
                            type="button"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteTask(task.id)}
                            className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Delete"
                            type="button"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Task Details Modal */}
      {viewingTask && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50">
          <div className="flex items-center justify-center min-h-screen">
            <div className="relative bg-white rounded-lg shadow-lg w-full max-w-2xl mx-4">
              <div className="flex items-start justify-between p-5 border-b rounded-t">
                <h3 className="text-xl font-semibold">Task Details</h3>
                <button
                  type="button"
                  className="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm p-1.5 ml-auto inline-flex items-center"
                  onClick={closeTaskDetails}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 text-sm font-medium text-gray-900">Order Number</label>
                    {isEditingInModal ? (
                      <input
                        ref={(el) => (inputRefs.current["orderNumber"] = el)}
                        value={editingTask?.orderNumber}
                        onChange={(e) => setEditingTask({ ...editingTask!, orderNumber: e.target.value })}
                        className="shadow-sm bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                        disabled={viewingTask?.status === "Completed"}
                      />
                    ) : (
                      <p className="text-gray-500">{viewingTask.orderName}</p>
                    )}
                  </div>
                  <div>
                    <label className="block mb-2 text-sm font-medium text-gray-900">Customer Name</label>
                    {isEditingInModal ? (
                      <input
                        ref={(el) => (inputRefs.current["customerName"] = el)}
                        value={editingTask?.customerName || ""}
                        onChange={(e) => setEditingTask({ ...editingTask!, customerName: e.target.value })}
                        className="shadow-sm bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                        disabled={viewingTask?.status === "Completed"}
                      />
                    ) : (
                      <p className="text-gray-500">{viewingTask.customerName || "-"}</p>
                    )}
                  </div>
                  <div>
                    <label className="block mb-2 text-sm font-medium text-gray-900">Phone Number</label>
                    {isEditingInModal ? (
                      <input
                        ref={(el) => (inputRefs.current["phoneNumber"] = el)}
                        value={editingTask?.phoneNumber || ""}
                        onChange={(e) => setEditingTask({ ...editingTask!, phoneNumber: e.target.value })}
                        className="shadow-sm bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                        disabled={viewingTask?.status === "Completed"}
                      />
                    ) : (
                      <p className="text-gray-500">{viewingTask.phoneNumber || "-"}</p>
                    )}
                  </div>
                  <div>
                    <label className="block mb-2 text-sm font-medium text-gray-900">Status</label>
                    {isEditingInModal ? (
                      <select
                        value={editingTask?.status}
                        onChange={(e) => setEditingTask({ ...editingTask!, status: e.target.value })}
                        className="shadow-sm bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-gray-500">{viewingTask.status}</p>
                    )}
                  </div>
                  <div>
                    <label className="block mb-2 text-sm font-medium text-gray-900">Effort</label>
                    {isEditingInModal ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-1">
                          {effortOptions.map((option) => (
                            <Button
                              key={option}
                              type="button"
                              size="sm"
                              variant={editingTask?.effort === option ? "default" : "outline"}
                              onClick={() => {
                                setEditingTask({ ...editingTask!, effort: option })
                              }}
                              disabled={viewingTask?.status === "Completed"}
                            >
                              {option}
                            </Button>
                          ))}
                        </div>
                        {isCustomEffort ? (
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editingTask?.effort !== undefined ? editingTask.effort : ""}
                              onChange={(e) => {
                                const value = Number.parseFloat(e.target.value)
                                if (!isNaN(value)) {
                                  setEditingTask({ ...editingTask!, effort: value })
                                } else {
                                  setEditingTask({ ...editingTask!, effort: "" })
                                }
                              }}
                              className="h-9"
                              placeholder="Custom value"
                              disabled={viewingTask?.status === "Completed"}
                            />
                            <Button
                              size="sm"
                              onClick={() => setIsCustomEffort(false)}
                              disabled={viewingTask?.status === "Completed"}
                            >
                              Use Preset
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setIsCustomEffort(true)}
                            disabled={viewingTask?.status === "Completed"}
                          >
                            Custom Value
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-500">{viewingTask.effort}</p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-900">Dates</label>
                      {isEditingInModal && (
                        <div className="flex items-center gap-2">
                          <label className="text-sm">Days to Complete:</label>
                          <input
                            type="number"
                            min="1"
                            value={daysToComplete?.toString() || "1"}
                            onChange={(e) => {
                              const days = Math.max(1, Number.parseInt(e.target.value) || 1)
                              setDaysToComplete(days)
                              if (editingTask) {
                                const endDate = parseISO(editingTask.endDate)
                                updateStartDate(endDate, days)
                              }
                            }}
                            className="shadow-sm bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 w-16 p-1"
                            disabled={viewingTask?.status === "Completed"}
                          />
                        </div>
                      )}
                    </div>
                    {isEditingInModal ? (
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block mb-1 text-xs font-medium text-gray-700">Start Date</label>
                          <div className="text-sm border border-gray-300 rounded-lg p-2 bg-gray-50">
                            {format(parseISO(editingTask?.startDate || ""), "MMM d, yyyy")}
                          </div>
                        </div>
                        <div>
                          <label className="block mb-1 text-xs font-medium text-gray-700">End Date</label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="w-full justify-start text-left font-normal"
                                onClick={(e) => e.preventDefault()}
                                disabled={viewingTask?.status === "Completed"}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {format(parseISO(editingTask?.endDate || ""), "MMM d, yyyy")}
                              </Button>
                            </PopoverTrigger>
                            {viewingTask?.status !== "Completed" && (
                              <PopoverContent className="w-auto p-0 z-50">
                                <Calendar
                                  mode="single"
                                  selected={parseISO(editingTask?.endDate || "")}
                                  onSelect={(date) => {
                                    if (date) handleEndDateSelect(date)
                                  }}
                                  initialFocus
                                  defaultMonth={parseISO(editingTask?.endDate || "")}
                                />
                              </PopoverContent>
                            )}
                          </Popover>
                        </div>
                        <div>
                          <label className="block mb-1 text-xs font-medium text-red-700">Due Date</label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="w-full justify-start text-left font-normal border-red-300"
                                onClick={(e) => e.preventDefault()}
                                disabled={viewingTask?.status === "Completed"}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4 text-red-500" />
                                {format(parseISO(editingTask?.dueDate || ""), "MMM d, yyyy")}
                              </Button>
                            </PopoverTrigger>
                            {viewingTask?.status !== "Completed" && (
                              <PopoverContent className="w-auto p-0 z-50">
                                <Calendar
                                  mode="single"
                                  selected={parseISO(editingTask?.dueDate || "")}
                                  onSelect={(date) => {
                                    if (!date || !editingTask) return

                                    const newDueDate = format(date, "yyyy-MM-dd")

                                    // Validate that due date is not before end date
                                    if (isBefore(date, parseISO(editingTask.endDate))) {
                                      toast({
                                        title: "Validation Error",
                                        description: "Due date cannot be before end date",
                                        variant: "destructive",
                                      })
                                      return
                                    }

                                    // Update the editing task
                                    setEditingTask({
                                      ...editingTask,
                                      dueDate: newDueDate,
                                    })
                                  }}
                                  initialFocus
                                  defaultMonth={parseISO(editingTask?.dueDate || "")}
                                />
                              </PopoverContent>
                            )}
                          </Popover>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block mb-1 text-xs font-medium text-gray-700">Start Date</label>
                          <p className="text-gray-500">{format(parseISO(viewingTask.startDate), "MMM d, yyyy")}</p>
                        </div>
                        <div>
                          <label className="block mb-1 text-xs font-medium text-gray-700">End Date</label>
                          <p className="text-gray-500">{format(parseISO(viewingTask.endDate), "MMM d, yyyy")}</p>
                        </div>
                        <div>
                          <label className="block mb-1 text-xs font-medium text-red-700">Due Date</label>
                          <p className="text-red-500">{format(parseISO(viewingTask.dueDate), "MMM d, yyyy")}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="block mb-2 text-sm font-medium text-gray-900">Notes</label>
                    {isEditingInModal ? (
                      <textarea
                        value={editingTask?.notes || ""}
                        onChange={(e) => setEditingTask({ ...editingTask!, notes: e.target.value })}
                        className="shadow-sm bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                        rows={4}
                        disabled={viewingTask?.status === "Completed"}
                      />
                    ) : (
                      <p className="text-gray-500 whitespace-pre-wrap" style={{ minHeight: "60px" }}>
                        {viewingTask.notes || "No notes"}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end p-6 space-x-2 border-t rounded-b">
                {isEditingInModal ? (
                  <>
                    <Button variant="outline" onClick={cancelModalEditing}>
                      Cancel
                    </Button>
                    <Button onClick={saveModalChanges}>Save Changes</Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={closeTaskDetails}>
                      Close
                    </Button>
                    <Button onClick={toggleEditInModal}>Edit</Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
