"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import { format, parseISO, isAfter, isBefore, addDays, isSameDay, getDay } from "date-fns"
import { X, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { type Task, taskColors, statusOptions } from "./calendar-with-tasks"
import { Badge } from "@/components/ui/badge"
import { CalendarIcon } from "lucide-react"
import type { Holiday } from "@/app/actions/holiday-actions"
import { HolidayWarningDialog } from "./holiday-warning-dialog"
import { toast } from "@/components/ui/use-toast"

// Add this validation function near the top of the file, before the TaskPanel component
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

// Add this function after the validateTaskDuration function and before the TaskPanelProps interface
export async function saveTaskToDatabase(task: Task, originalTask: Task | null, supabase: any, isDbConnected = true) {
  try {
    console.log("Saving task to database:", task)

    // Calculate holiday dates
    const taskStart = parseISO(task.startDate)
    const taskEnd = parseISO(task.endDate)

    // Get holiday dates - we need to pass holidays here
    const holidayDates = task.holidayDates || []

    // Prepare base update data with columns that definitely exist
    const updateData: any = {
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
      updated_at: new Date().toISOString(),
      holiday_dates: holidayDates,
      // Always include days_to_complete in the update data
      days_to_complete: task.daysToComplete,
    }

    // Only try to update database if connected
    if (isDbConnected && supabase) {
      // Update task in Supabase with the appropriate fields
      const { error } = await supabase.from("tasks").update(updateData).eq("id", task.id)

      if (error) {
        console.error("Error updating task in database:", error)
        return {
          success: false,
          error: "Failed to save to database, but task was updated locally.",
          task,
        }
      }

      // Generate change details for logging if we have an original task
      if (originalTask) {
        const changeDetails = generateChangeDetails(originalTask, task)

        // Try to save log to Supabase
        await supabase.from("logs").insert({
          timestamp: new Date().toISOString(),
          action_type: "modified",
          task_id: task.id,
          order_number: task.orderNumber,
          order_name: task.orderName,
          details: changeDetails,
          user_name: "User",
        })

        // Also save to localStorage for backward compatibility
        const logEntry = createLogEntry("modified", task, changeDetails)
        saveLog(logEntry)
      }
    } else {
      // If database is not connected, just log locally
      if (originalTask) {
        const changeDetails = generateChangeDetails(originalTask, task)
        const logEntry = createLogEntry("modified", task, changeDetails + " (local only)")
        saveLog(logEntry)
      }
    }

    return {
      success: true,
      task,
    }
  } catch (error) {
    console.error("Error saving task:", error)
    return {
      success: false,
      error: "Failed to save task. Please try again.",
      task,
    }
  }
}

// Add the generateChangeDetails function that was previously in other files
function generateChangeDetails(original: Task, updated: Task): string {
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
      changes.push(`Notes: "${original.notes || "None"}" → "${updated.notes || "None"}"`)
    }
  }

  return changes.length > 0 ? `Changes: ${changes.join(", ")}` : "No significant changes detected"
}

// Mock functions for createLogEntry and saveLog
const createLogEntry = (actionType: string, task: Task, details: string) => {
  return {
    timestamp: new Date().toISOString(),
    action_type: actionType,
    task_id: task.id,
    order_number: task.orderNumber,
    order_name: task.orderName,
    details: details,
    user_name: "User",
  }
}

const saveLog = (logEntry: any) => {
  // In a real application, this would save the log to localStorage or a database
  console.log("Saving log:", logEntry)
}

// Now update the TaskPanelProps interface to include supabase and isDbConnected
interface TaskPanelProps {
  task: Task | null
  isOpen: boolean
  onClose: () => void
  onSave: (task: Task) => void
  isNewTask?: boolean
  allTasks?: Task[] // Add allTasks prop to access all tasks
  holidays?: Holiday[] // Add holidays prop
  tasksAffectedByNewHolidays?: Set<number>
  supabase?: any // Add supabase client
  isDbConnected?: boolean // Add database connection status
}

// Define effortOptions here
const effortOptions = [25, 33.33, 50, 75]

// Now update the TaskPanel component to include the new props with default values
export function TaskPanel({
  task,
  isOpen,
  onClose,
  onSave,
  isNewTask = false,
  allTasks = [],
  holidays = [],
  tasksAffectedByNewHolidays,
  supabase = null,
  isDbConnected = true,
}: TaskPanelProps) {
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [daysToComplete, setDaysToComplete] = useState<number>(1)
  const [dateError, setDateError] = useState<string | null>(null)
  const [tasksWithSameDueDate, setTasksWithSameDueDate] = useState<number>(0)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
  const [originalTask, setOriginalTask] = useState<Task | null>(null)
  // Add the numberOfHolidays state variable at the top of the component
  const [numberOfHolidays, setNumberOfHolidays] = useState<number>(0)
  // Add validation state
  const [validationErrors, setValidationErrors] = useState<{
    endDate?: string
    dueDate?: string
    orderNumber?: string
  }>({})

  // State for holiday warnings
  const [holidayWarnings, setHolidayWarnings] = useState<string[]>([])

  // State for holiday warning dialog
  const [showWarningDialog, setShowWarningDialog] = useState(false)

  // Add this state variable with the other state declarations
  const [holidayCountMismatch, setHolidayCountMismatch] = useState<boolean>(false)
  const [calculatedHolidayCount, setCalculatedHolidayCount] = useState<number>(0)

  // Add these state variables
  const [outdatedHolidayDates, setOutdatedHolidayDates] = useState<string[]>([])
  const [hasOutdatedHolidayDates, setHasOutdatedHolidayDates] = useState(false)

  // Count tasks with the same due date - memoized to prevent infinite loops
  const countTasksWithSameDueDate = useCallback(
    (dueDateStr: string, currentTaskId: number) => {
      if (!dueDateStr) return // Skip if due date is empty

      const dueDate = parseISO(dueDateStr)

      // Filter tasks with the same due date, excluding the current task
      const count = allTasks.filter((t) => {
        return t.id !== currentTaskId && t.dueDate && isSameDay(parseISO(t.dueDate), dueDate)
      }).length

      setTasksWithSameDueDate(count)
    },
    [allTasks],
  )

  // Add a function to check if a date is a holiday - memoized
  const isHoliday = useCallback(
    (date: Date) => {
      if (!holidays || holidays.length === 0) return false

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
    },
    [holidays],
  )

  // Add a helper function to get the holiday name - memoized
  const getHolidayName = useCallback(
    (date: Date): string => {
      if (!holidays || holidays.length === 0) return "Unknown holiday"

      const dateStr = format(date, "yyyy-MM-dd")
      const dayOfWeek = getDay(date)

      const matchingHolidays = holidays.filter((holiday) => {
        if (holiday.holiday_type === "specific_date" && holiday.specific_date) {
          return holiday.specific_date === dateStr
        }
        if (holiday.holiday_type === "day_of_week" && holiday.day_of_week !== null) {
          return holiday.day_of_week === dayOfWeek
        }
        return false
      })

      if (matchingHolidays.length === 0) return "Unknown holiday"
      return matchingHolidays.map((h) => h.name).join(", ")
    },
    [holidays],
  )

  // Helper function to check if a task is completed
  const isTaskCompleted = () => {
    return editingTask?.status === "Completed"
  }

  // Update the countHolidaysBetweenDates function to ensure it only counts actual holidays

  // Add a function to count holidays between two dates
  const countHolidaysBetweenDates = useCallback(
    (startDate: Date, endDate: Date): number => {
      let count = 0
      const currentDate = new Date(startDate) // Create a new Date object to avoid modifying the original

      while (currentDate <= endDate) {
        if (isHoliday(currentDate)) {
          count++
        }
        currentDate.setDate(currentDate.getDate() + 1) // Use setDate to increment the date
      }

      return count
    },
    [isHoliday],
  )

  // Add a function to get holiday dates in range
  // Add this function after the countHolidaysBetweenDates function

  const getHolidayDatesInRange = (startDate: Date, endDate: Date): string[] => {
    const holidayDates: string[] = []
    const currentDate = new Date(startDate)

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

  // Add a function to calculate working days between two dates
  const calculateWorkingDays = useCallback(
    (startDate: Date, endDate: Date): { workingDays: number; holidayCount: number } => {
      const totalDays = differenceInDays(endDate, startDate) + 1
      let holidayCount = 0

      for (let i = 0; i < totalDays; i++) {
        const currentDate = addDays(startDate, i)
        if (isHoliday(currentDate)) {
          holidayCount++
        }
      }

      return {
        workingDays: totalDays - holidayCount,
        holidayCount,
      }
    },
    [isHoliday],
  )

  // Initialize editing task when panel opens
  const initializedRef = useRef(false)

  // Update the useEffect that initializes the editingTask to use the holiday dates from the database
  useEffect(() => {
    if (task && isOpen && !initializedRef.current) {
      initializedRef.current = true

      // Create a copy of the task
      const taskCopy = { ...task }

      // If it's a new task, clear the order number and set a random color
      if (isNewTask) {
        taskCopy.orderNumber = ""
        // Select a random color from taskColors array
        taskCopy.color = taskColors[Math.floor(Math.random() * taskColors.length)]
      }

      setEditingTask(taskCopy)
      setOriginalTask({ ...task }) // Store the original task for comparison

      // Set the date state variables
      if (task.endDate) {
        setEndDate(parseISO(task.endDate))
      } else {
        setEndDate(undefined)
      }

      if (task.dueDate) {
        setDueDate(parseISO(task.dueDate))
      } else {
        setDueDate(undefined)
      }

      // Always use the database value for daysToComplete if it exists
      if (task.daysToComplete) {
        setDaysToComplete(task.daysToComplete)
      } else if (isNewTask) {
        // For new tasks, default to 1 day
        setDaysToComplete(1)
      } else if (task.startDate && task.endDate) {
        // Only calculate if no database value exists (for backward compatibility)
        const taskStart = parseISO(task.startDate)
        const taskEnd = parseISO(task.endDate)
        const totalDays = differenceInDays(taskEnd, taskStart) + 1
        setDaysToComplete(totalDays)
      } else {
        setDaysToComplete(1)
      }

      setDateError(null)
      setValidationErrors({})

      // Count tasks with the same due date
      if (task.dueDate) {
        countTasksWithSameDueDate(task.dueDate, task.id)
      }
    }

    // Reset the initialization flag when the panel closes
    if (!isOpen) {
      initializedRef.current = false
    }
  }, [task, isOpen, isNewTask, countTasksWithSameDueDate, calculateWorkingDays, countHolidaysBetweenDates])

  // Add this effect to check for holiday count discrepancies after the other useEffect that initializes the task
  useEffect(() => {
    if (!task || !isOpen || !task.startDate || !task.endDate) return

    // Calculate the actual holiday count based on current holidays
    const taskStart = parseISO(task.startDate)
    const taskEnd = parseISO(task.endDate)
    const actualHolidayCount = countHolidaysBetweenDates(taskStart, taskEnd)
  }, [task, isOpen, countHolidaysBetweenDates])

  // Add this useEffect to check for outdated holiday dates
  useEffect(() => {
    if (!editingTask?.holidayDates || !holidays || holidays.length === 0) {
      setOutdatedHolidayDates([])
      setHasOutdatedHolidayDates(false)
      return
    }

    // Check each stored holiday date
    const outdatedDates = editingTask.holidayDates.filter((dateStr) => {
      const date = parseISO(dateStr)
      // If this date is no longer a holiday, it's outdated
      return !isHoliday(date)
    })

    setOutdatedHolidayDates(outdatedDates)
    setHasOutdatedHolidayDates(outdatedDates.length > 0)
  }, [editingTask?.holidayDates, holidays, isHoliday])

  // Add this function to check if the task has been modified
  const hasTaskChanged = useCallback(() => {
    if (!editingTask || !originalTask) return false

    return (
      editingTask.orderNumber !== originalTask.orderNumber ||
      editingTask.orderName !== originalTask.orderName ||
      editingTask.startDate !== originalTask.startDate ||
      editingTask.endDate !== originalTask.endDate ||
      editingTask.dueDate !== originalTask.dueDate ||
      editingTask.notes !== originalTask.notes ||
      editingTask.color !== originalTask.color ||
      editingTask.effort !== originalTask.effort ||
      editingTask.customerName !== originalTask.customerName ||
      editingTask.phoneNumber !== originalTask.phoneNumber ||
      editingTask.status !== originalTask.status ||
      editingTask.daysToComplete !== originalTask.daysToComplete
    )
  }, [editingTask, originalTask])

  // Fix the holiday warnings useEffect to prevent infinite loops
  // Replace this useEffect:

  // Check for holiday warnings when dates change
  useEffect(() => {
    if (!editingTask || !holidays || holidays.length === 0) return

    const warnings: string[] = []

    // Check if start date is a holiday
    if (editingTask?.startDate && isHoliday(parseISO(editingTask.startDate))) {
      const holidayName = getHolidayName(parseISO(editingTask.startDate))
      warnings.push(`Start date (${format(parseISO(editingTask.startDate), "MMM d")}) falls on holiday: ${holidayName}`)
    }

    // Check if end date is a holiday
    if (editingTask?.endDate && isHoliday(parseISO(editingTask.endDate))) {
      const holidayName = getHolidayName(parseISO(editingTask.endDate))
      warnings.push(`End date (${format(parseISO(editingTask.endDate), "MMM d")}) falls on holiday: ${holidayName}`)
    }

    // Check if due date is a holiday
    if (editingTask?.dueDate && isHoliday(parseISO(editingTask.dueDate))) {
      const holidayName = getHolidayName(parseISO(editingTask.dueDate))
      warnings.push(`Due date (${format(parseISO(editingTask.dueDate), "MMM d")}) falls on holiday: ${holidayName}`)
    }

    // Only update if warnings have actually changed
    const warningsString = warnings.join("|")
    const currentWarningsString = holidayWarnings.join("|")

    if (warningsString !== currentWarningsString) {
      setHolidayWarnings(warnings)
    }
  }, [
    editingTask?.startDate,
    editingTask?.endDate,
    editingTask?.dueDate,
    isHoliday,
    getHolidayName,
    holidays,
    holidayWarnings,
    editingTask,
  ])

  // Calculate start date based on end date and working days
  const calculateStartDate = useCallback(
    (endDate: Date, workingDays: number): Date => {
      let currentDate = endDate
      let remainingWorkingDays = workingDays - 1

      // Count backwards until we've found enough working days
      while (remainingWorkingDays > 0) {
        // Move one day back
        currentDate = addDays(currentDate, -1)

        // Check if this day is a holiday
        const isHolidayDay = isHoliday(currentDate)

        // If it's not a holiday, count it as a working day
        if (!isHolidayDay) {
          remainingWorkingDays--
        }
      }

      return currentDate
    },
    [isHoliday],
  )

  // Update the updateStartDate function to account for holidays
  const handleEndDateSelect = (date: Date | undefined) => {
    if (!date || !editingTask) return

    const newEndDate = format(date, "yyyy-MM-dd")
    setEndDate(date)

    // Clear validation error for end date
    setValidationErrors((prev) => ({ ...prev, endDate: undefined }))

    // If end date is after due date, update due date to match end date
    if (dueDate && isAfter(date, dueDate)) {
      setDueDate(date)
      setEditingTask({
        ...editingTask,
        endDate: newEndDate,
        dueDate: newEndDate,
      })

      // Clear validation error for due date as well
      setValidationErrors((prev) => ({ ...prev, endDate: undefined }))
    } else {
      setEditingTask({
        ...editingTask,
        endDate: newEndDate,
      })
    }

    // When end date changes, update the start date based on the current daysToComplete value
    // This preserves the user's input for daysToComplete and accounts for holidays
    updateStartDate(date, daysToComplete)
  }

  // Update the updateStartDate function to correctly calculate holiday count
  const updateStartDate = useCallback(
    (endDate: Date, days: number) => {
      if (!editingTask) return

      // We need to find a start date such that:
      // The number of working days between start and end equals the user input
      // This means we need to count backwards from the end date, skipping holidays

      // For the special case where days = 1, the start date should be the same as the end date
      if (days === 1) {
        const formattedStartDate = format(endDate, "yyyy-MM-dd")

        // Check if the end date itself is a holiday
        const holidayCount = isHoliday(endDate) ? 1 : 0

        setEditingTask((prev) => {
          if (!prev) return null
          return {
            ...prev,
            startDate: formattedStartDate,
          }
        })

        return
      }

      let currentDate = endDate
      let remainingWorkingDays = days - 1

      // Count backwards until we've found enough working days
      while (remainingWorkingDays > 0) {
        // Move one day back
        currentDate = addDays(currentDate, -1)

        // Check if this day is a holiday
        const isHolidayDay = isHoliday(currentDate)

        // If it's not a holiday, count it as a working day
        if (!isHolidayDay) {
          remainingWorkingDays--
        }
      }

      // The currentDate is now our start date
      const formattedStartDate = format(currentDate, "yyyy-MM-dd")

      setEditingTask((prev) => {
        if (!prev) return null

        // Only update if the values have actually changed
        if (prev.startDate === formattedStartDate) {
          return prev
        }

        return {
          ...prev,
          startDate: formattedStartDate,
          // Keep the original daysToComplete value
          daysToComplete: prev.daysToComplete,
        }
      })
    },
    [editingTask, isHoliday],
  )

  // Calculate end date based on start date and working days
  const calculateEndDate = useCallback(
    (startDate: Date, workingDays: number): Date => {
      let currentDate = new Date(startDate)
      let daysFound = 1 // Start date counts as 1 working day

      // We need to go forward from the start date until we find enough working days
      while (daysFound < workingDays) {
        // Move one day forward
        currentDate = addDays(currentDate, 1)

        // If it's not a holiday, count it as a working day
        if (!isHoliday(currentDate)) {
          daysFound++
        }
      }

      return currentDate
    },
    [isHoliday],
  )

  // Validate the form before saving
  const validateForm = (): boolean => {
    const errors: {
      endDate?: string
      dueDate?: string
      orderNumber?: string
    } = {}

    // Check if end date is set
    if (!editingTask?.endDate) {
      errors.endDate = "End date is required"
    }

    // Check if due date is set
    if (!editingTask?.dueDate) {
      errors.dueDate = "Due date is required"
    }

    // Check if order number is set
    if (!editingTask?.orderNumber) {
      errors.orderNumber = "Order number is required"
    }

    // Update validation errors state
    setValidationErrors(errors)

    // Return true if no errors
    return Object.keys(errors).length === 0
  }

  // Handle save
  const handleSave = () => {
    if (!editingTask) return

    // Validate the form
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      })
      return
    }

    // Validate dates
    const end = parseISO(editingTask.endDate)
    const due = parseISO(editingTask.dueDate)

    // Only validate if end date is AFTER due date (not equal)
    if (isAfter(end, due)) {
      // Instead of showing an error, set due date equal to end date
      const newDueDate = format(end, "yyyy-MM-dd")
      setEditingTask((prev) => {
        if (!prev) return null
        return {
          ...prev,
          dueDate: newDueDate,
        }
      })
      return // Return early to prevent saving with invalid dates
    }

    // Validate task duration
    const durationValidation = validateTaskDuration(editingTask.startDate, editingTask.endDate)
    if (!durationValidation.valid) {
      toast({
        title: "Validation Error",
        description: durationValidation.message,
        variant: "destructive",
      })
      return // Return early to prevent saving with invalid duration
    }

    // Check if there are holiday warnings AND the task has been modified
    // For new tasks, always show warnings if they exist
    if (holidayWarnings.length > 0 && (isNewTask || hasTaskChanged())) {
      // Show warning dialog
      setShowWarningDialog(true)
      return
    }

    // No warnings or no changes, proceed with save
    proceedWithSave()
  }

  // Update the proceedWithSave function to ensure it's using the correct holiday dates length
  const proceedWithSave = async () => {
    if (!editingTask) return

    // Calculate holiday dates
    const startDate = parseISO(editingTask.startDate)
    const endDate = parseISO(editingTask.endDate)
    const holidayDates = getHolidayDatesInRange(startDate, endDate)

    // Prepare final task object
    const finalTask = {
      ...editingTask,
      daysToComplete: daysToComplete,
      holidayDates: holidayDates,
    }

    try {
      // If supabase is provided, use the common function to save to database
      if (supabase) {
        const result = await saveTaskToDatabase(finalTask, originalTask, supabase, isDbConnected)

        if (!result.success) {
          toast({
            title: "Error",
            description: result.error,
            variant: "destructive",
          })
        } else {
          // Always call onSave to update the UI
          onSave(finalTask)

          // Close the panel after successful save
          onClose()

          // Dispatch an event to notify that tasks have been updated
          window.dispatchEvent(new CustomEvent("tasks-updated"))

          toast({
            title: "Success",
            description: "Task updated successfully",
          })
        }
      } else {
        // Always call onSave to update the UI
        onSave(finalTask)

        // Close the panel after successful save
        onClose()

        // Dispatch an event to notify that tasks have been updated
        window.dispatchEvent(new CustomEvent("tasks-updated"))
      }
    } catch (error) {
      console.error("Error saving task:", error)
      toast({
        title: "Error",
        description: "Failed to save task. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Handle due date selection
  const handleDueDateSelect = (date: Date | undefined) => {
    if (!date || !editingTask) return

    const newDueDate = format(date, "yyyy-MM-dd")
    setDueDate(date)

    // Clear validation error for due date
    setValidationErrors((prev) => ({ ...prev, dueDate: undefined }))

    // If due date is before end date, update end date to match due date
    // OR if end date is empty, set end date to due date
    if ((endDate && isBefore(date, endDate)) || !editingTask.endDate) {
      const newEndDate = format(date, "yyyy-MM-dd")
      setEndDate(date)
      setEditingTask({
        ...editingTask,
        dueDate: newDueDate,
        endDate: newEndDate,
      })

      // Clear validation error for end date as well
      setValidationErrors((prev) => ({ ...prev, endDate: undefined }))

      // Also update start date based on the new end date
      const newStartDate = calculateStartDate(date, daysToComplete)
      const formattedStartDate = format(newStartDate, "yyyy-MM-dd")

      setEditingTask((prev) => {
        if (!prev) return null
        return {
          ...prev,
          startDate: formattedStartDate,
          endDate: newEndDate,
          dueDate: newDueDate,
        }
      })
    } else {
      setEditingTask({
        ...editingTask,
        dueDate: newDueDate,
      })
    }

    // Count tasks with the same due date
    countTasksWithSameDueDate(newDueDate, editingTask.id)
  }

  // Update the handleWorkingDaysChange function to correctly calculate holidays

  // Also update the handleWorkingDaysChange function to ensure it recalculates holidays properly
  // Find the handleWorkingDaysChange function and update it:

  // Handle working days input change
  const handleWorkingDaysChange = (days: number) => {
    if (!editingTask || !endDate) return

    setDaysToComplete(days)

    // Special case for days = 1
    if (days === 1) {
      const formattedStartDate = format(endDate, "yyyy-MM-dd")

      // Check if the end date itself is a holiday
      const holidayCount = isHoliday(endDate) ? 1 : 0

      setEditingTask((prev) => {
        if (!prev) return null
        return {
          ...prev,
          startDate: formattedStartDate,
        }
      })

      return
    }

    // For days > 1, calculate normally
    const newStartDate = calculateStartDate(endDate, days)
    const formattedStartDate = format(newStartDate, "yyyy-MM-dd")

    setEditingTask((prev) => {
      if (!prev) return null
      return {
        ...prev,
        startDate: formattedStartDate,
        // Explicitly update daysToComplete when the user changes it
        daysToComplete: days,
      }
    })
  }

  // Add a function to update the holiday count
  const updateHolidayCount = () => {
    if (!editingTask) return

    const oldCount = editingTask.holidayDates || 0
    const difference = calculatedHolidayCount - oldCount
    const changeType = difference > 0 ? "increased" : "decreased"

    setEditingTask({
      ...editingTask,
    })

    setHolidayCountMismatch(false)

    toast({
      title: "Holiday Count Updated",
      description: `Holiday count ${changeType} from ${oldCount} to ${calculatedHolidayCount} (${Math.abs(difference)} ${difference > 0 ? "added" : "removed"})`,
    })
  }

  // Add a function to update outdated holiday dates
  // Remove the updateOutdatedHolidayDates function since we want users to manually save tasks to update holiday dates

  // This function was automatically updating holiday dates which we don't want

  // Add this before the return statement in the TaskPanel component
  const renderHolidayWarnings = () => {
    const warnings = [...holidayWarnings]

    // Add warnings for outdated holiday dates with specific dates listed
    if (hasOutdatedHolidayDates) {
      const formattedDates = outdatedHolidayDates.map((dateStr) => format(parseISO(dateStr), "MMM d, yyyy")).join(", ")

      warnings.push(`Task contains cancelled holidays on: ${formattedDates}`)
    }

    if (warnings.length === 0) return null

    // Return the JSX for tasks affected by new holidays
    if (tasksAffectedByNewHolidays && tasksAffectedByNewHolidays.has(editingTask?.id || -1)) {
      return (
        <div className="bg-red-50 border border-red-300 rounded-md p-3 mb-4">
          <div className="flex items-center text-red-700 font-medium mb-2">
            <AlertCircle className="h-4 w-4 mr-2" />
            New Holiday Conflict Detected
          </div>
          <p className="text-sm text-red-600 mb-2">
            This task is scheduled on dates that are now holidays. Please review and adjust the task dates.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="bg-red-50 border-red-300 text-red-700 hover:bg-red-100"
            onClick={() => {
              if (!editingTask || !editingTask.endDate) return

              // Keep the end date the same
              const endDate = parseISO(editingTask.endDate)

              // Calculate a new start date based on working days and holidays
              // We need to find a start date such that there are exactly daysToComplete working days
              // between the start date and the end date
              let currentDate = endDate
              let workingDaysFound = 1 // End date counts as 1 working day

              // Count backwards until we've found enough working days
              while (workingDaysFound < daysToComplete) {
                // Move one day back
                currentDate = addDays(currentDate, -1)

                // If this day is not a holiday, count it as a working day
                if (!isHoliday(currentDate)) {
                  workingDaysFound++
                }
              }

              // The currentDate is now our new start date
              const formattedStartDate = format(currentDate, "yyyy-MM-dd")

              // Update the task with the new start date
              const updatedTask = {
                ...editingTask,
                startDate: formattedStartDate,
                // Recalculate holiday dates for the updated date range
                holidayDates: getHolidayDatesInRange(currentDate, endDate),
              }

              // Update the UI state
              setEditingTask(updatedTask)

              // Save directly to avoid any state timing issues
              onSave(updatedTask)

              // Show success toast
              toast({
                title: "Task Updated",
                description: `Start date recalculated to account for new holidays.`,
              })
            }}
          >
            Auto-Fix & Save
          </Button>
        </div>
      )
    }

    // Check if start or end date falls on a holiday for more prominent warning
    const startOnHoliday = editingTask?.startDate && isHoliday(parseISO(editingTask.startDate))
    const endOnHoliday = editingTask?.endDate && isHoliday(parseISO(editingTask.endDate))
    const criticalWarning = startOnHoliday || endOnHoliday || hasOutdatedHolidayDates

    return (
      <div
        className={`${criticalWarning ? "bg-amber-100" : "bg-amber-50"} border ${criticalWarning ? "border-amber-300" : "border-amber-200"} rounded-md p-3 mb-4`}
      >
        <div className="flex items-center text-amber-700 font-medium mb-2">
          <AlertCircle className="h-4 w-4 mr-2" />
          {criticalWarning ? "Critical Holiday Warning" : "Holiday Warning"}
        </div>
        <ul className="text-sm text-amber-600 pl-5 list-disc space-y-1">
          {warnings.map((warning, index) => (
            <li key={index} className={criticalWarning ? "font-medium" : ""}>
              {warning}
            </li>
          ))}
        </ul>
        {hasOutdatedHolidayDates && (
          <div className="mt-2 text-sm text-amber-700">
            <p className="font-medium mb-2">
              Holiday dates have changed. Please update the end date to fix this issue.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
              onClick={() => {
                if (!editingTask || !editingTask.endDate) return

                // Keep the end date the same
                const endDate = parseISO(editingTask.endDate)

                // Calculate a new start date based on working days and holidays
                let currentDate = endDate
                let workingDaysFound = 1 // End date counts as 1 working day

                // Count backwards until we've found enough working days
                while (workingDaysFound < daysToComplete) {
                  // Move one day back
                  currentDate = addDays(currentDate, -1)

                  // If this day is not a holiday, count it as a working day
                  if (!isHoliday(currentDate)) {
                    workingDaysFound++
                  }
                }

                // The currentDate is now our new start date
                const formattedStartDate = format(currentDate, "yyyy-MM-dd")

                // Update the task with the new start date
                const updatedTask = {
                  ...editingTask,
                  startDate: formattedStartDate,
                  // Recalculate holiday dates for the updated date range
                  holidayDates: getHolidayDatesInRange(currentDate, endDate),
                }

                // Update the UI state
                setEditingTask(updatedTask)

                // Save directly to avoid any state timing issues
                onSave(updatedTask)

                // Show success toast
                toast({
                  title: "Task Updated",
                  description: `Start date recalculated to account for holidays.`,
                })
              }}
            >
              Auto-Fix & Save
            </Button>
          </div>
        )}
        {criticalWarning && !hasOutdatedHolidayDates && (
          <p className="mt-2 text-sm text-amber-700 font-medium">
            Tasks that start or end on holidays may cause scheduling conflicts.
          </p>
        )}
      </div>
    )
  }

  if (!isOpen || !editingTask) return null

  // Change how numberOfHolidays is displayed
  const numHolidays = editingTask?.holidayDates ? editingTask.holidayDates.length : editingTask?.numberOfHolidays || 0

  return (
    <div
      className={cn(
        "fixed inset-y-0 right-0 z-50 w-full sm:w-[350px] bg-white shadow-xl transform transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "translate-x-full",
      )}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-3 border-b">
          <h2 className="text-lg font-bold">{isNewTask ? "Create Task" : "Edit Task"}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-3 overflow-y-auto">
          {/* Render holiday warnings at the */}
          {renderHolidayWarnings()}
          {tasksAffectedByNewHolidays && tasksAffectedByNewHolidays.has(editingTask?.id || -1) && (
            <div className="bg-red-50 border border-red-300 rounded-md p-3 mb-4">
              <div className="flex items-center text-red-700 font-medium mb-2">
                <AlertCircle className="h-4 w-4 mr-2" />
                New Holiday Conflict Detected
              </div>
              <p className="text-sm text-red-600 mb-2">
                New holidays have been added that affect this task. Please review the task dates.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="bg-red-50 border-red-300 text-red-700 hover:bg-red-100"
                onClick={() => {
                  if (!editingTask || !editingTask.endDate) return

                  // Keep the end date the same
                  const endDate = parseISO(editingTask.endDate)

                  // Calculate a new start date based on working days and holidays
                  let currentDate = endDate
                  let workingDaysFound = 1 // End date counts as 1 working day

                  // Count backwards until we've found enough working days
                  while (workingDaysFound < daysToComplete) {
                    // Move one day back
                    currentDate = addDays(currentDate, -1)

                    // If this day is not a holiday, count it as a working day
                    if (!isHoliday(currentDate)) {
                      workingDaysFound++
                    }
                  }

                  // The currentDate is now our new start date
                  const formattedStartDate = format(currentDate, "yyyy-MM-dd")

                  // Update the task with the new start date
                  const updatedTask = {
                    ...editingTask,
                    startDate: formattedStartDate,
                    // Recalculate holiday dates for the updated date range
                    holidayDates: getHolidayDatesInRange(currentDate, endDate),
                  }

                  // Update the UI state
                  setEditingTask(updatedTask)

                  // Save directly to avoid any state timing issues
                  onSave(updatedTask)

                  // Show success toast
                  toast({
                    title: "Task Updated",
                    description: `Start date recalculated to account for new holidays.`,
                  })
                }}
              >
                Auto-Fix & Save
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <div className="space-y-1">
              <Label htmlFor="orderNumber" className="text-xs flex items-center">
                Order Number <span className="text-red-500 ml-1">*</span>
              </Label>
              <Input
                id="orderNumber"
                value={editingTask.orderNumber}
                onChange={(e) => setEditingTask({ ...editingTask, orderNumber: e.target.value })}
                className={cn(
                  "h-8 text-sm",
                  !editingTask.orderNumber && validationErrors.orderNumber && "border-red-500",
                )}
                placeholder="Enter order number"
                required
                disabled={isTaskCompleted()}
              />
              {validationErrors.orderNumber && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.orderNumber}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="orderName" className="text-xs">
                Order Name
              </Label>
              <Input
                id="orderName"
                value={editingTask.orderName}
                onChange={(e) => setEditingTask({ ...editingTask, orderName: e.target.value })}
                className="h-8 text-sm"
                disabled={isTaskCompleted()}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="customerName" className="text-xs">
                Customer Name
              </Label>
              <Input
                id="customerName"
                value={editingTask.customerName || ""}
                onChange={(e) => setEditingTask({ ...editingTask, customerName: e.target.value })}
                className="h-8 text-sm"
                disabled={isTaskCompleted()}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="phoneNumber" className="text-xs">
                Phone Number
              </Label>
              <Input
                id="phoneNumber"
                value={editingTask.phoneNumber || ""}
                onChange={(e) => setEditingTask({ ...editingTask, phoneNumber: e.target.value })}
                className="h-8 text-sm"
                disabled={isTaskCompleted()}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="status" className="text-xs">
                Status
              </Label>
              <select
                id="status"
                value={editingTask.status}
                onChange={(e) => setEditingTask({ ...editingTask, status: e.target.value })}
                className="w-full border rounded-md p-1 h-8 text-sm"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="effort" className="text-xs">
                Effort
              </Label>
              <div className="flex flex-wrap gap-1">
                {effortOptions.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={editingTask.effort === option ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setEditingTask({ ...editingTask, effort: option })}
                    disabled={isTaskCompleted()}
                  >
                    {option}
                  </Button>
                ))}
                <Input
                  id="effort"
                  type="number"
                  step="0.01"
                  min="0"
                  value={!effortOptions.includes(editingTask.effort) ? editingTask.effort : ""}
                  onChange={(e) => {
                    const value = Number.parseFloat(e.target.value)
                    if (!isNaN(value)) {
                      setEditingTask({ ...editingTask, effort: value })
                    }
                  }}
                  placeholder="Custom"
                  className="h-7 text-xs w-20"
                  disabled={isTaskCompleted()}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="dueDate" className="text-xs text-red-500 font-semibold flex items-center justify-between">
                <span>
                  Due Date <span className="text-red-500 ml-1">*</span>
                </span>
                {tasksWithSameDueDate > 0 && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                    {tasksWithSameDueDate} other {tasksWithSameDueDate === 1 ? "task" : "tasks"}
                  </Badge>
                )}
              </Label>
              <div className="relative">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="dueDate"
                      variant={validationErrors.dueDate ? "destructive" : "outline"}
                      className={cn(
                        "w-full h-8 justify-start text-left font-normal text-sm border-red-300 text-red-600 hover:bg-red-50",
                        !editingTask.dueDate && "text-muted-foreground",
                        tasksWithSameDueDate > 0 && "border-amber-300 bg-amber-50/50",
                      )}
                      type="button"
                      disabled={isTaskCompleted()}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editingTask.dueDate
                        ? format(dueDate || parseISO(editingTask.dueDate), "MMM d, yyyy")
                        : "Select due date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-auto" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={(date) => {
                        handleDueDateSelect(date)
                        // Force close the popover immediately
                        document.body.click()
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {validationErrors.dueDate && <p className="text-xs text-red-500 mt-1">{validationErrors.dueDate}</p>}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="endDate" className="text-xs flex items-center">
                End Date <span className="text-red-500 ml-1">*</span>
              </Label>
              <div className="relative">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="endDate"
                      variant={validationErrors.endDate ? "destructive" : "outline"}
                      className={cn(
                        "w-full h-8 justify-start text-left font-normal text-sm",
                        !editingTask.endDate && "text-muted-foreground",
                      )}
                      type="button"
                      disabled={isTaskCompleted()}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editingTask.endDate
                        ? format(endDate || parseISO(editingTask.endDate), "MMM d, yyyy")
                        : "Select end date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-auto" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={(date) => {
                        handleEndDateSelect(date)
                        // Force close the popover immediately
                        document.body.click()
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {validationErrors.endDate && <p className="text-xs text-red-500 mt-1">{validationErrors.endDate}</p>}
              </div>
            </div>

            <div className="space-y-1 col-span-2">
              <div className="grid grid-cols-2 gap-x-3">
                <div>
                  <Label htmlFor="daysToComplete" className="text-xs">
                    Working Days
                  </Label>
                  <Input
                    id="daysToComplete"
                    type="number"
                    min="1"
                    value={daysToComplete === 0 ? "" : daysToComplete}
                    onChange={(e) => {
                      const inputValue = e.target.value
                      // Allow empty input
                      const days = inputValue === "" ? 0 : Math.max(1, Number.parseInt(inputValue) || 1)
                      handleWorkingDaysChange(days)
                    }}
                    onBlur={() => {
                      // Ensure we don't have 0 days when user leaves the field
                      if (daysToComplete < 1) {
                        handleWorkingDaysChange(1)
                      }
                    }}
                    className="h-8 text-sm"
                    disabled={isTaskCompleted()}
                  />
                </div>
                <div>
                  <Label htmlFor="numberOfHolidays" className="text-xs">
                    Holidays
                  </Label>
                  <div className="text-sm border p-1 rounded-md h-8 flex items-center text-xs bg-gray-50">
                    {editingTask?.holidayDates ? editingTask.holidayDates.length : 0}
                    {holidayCountMismatch && (
                      <span className="ml-2 text-amber-600 font-medium flex items-center">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Outdated
                      </span>
                    )}
                  </div>
                  {holidayCountMismatch && (
                    <div className="mt-1 p-2 bg-red-50 border border-red-200 rounded-md text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center text-red-600">
                          <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
                          <span>
                            Count outdated:{" "}
                            <span className="line-through">
                              {editingTask?.holidayDates ? editingTask.holidayDates.length : 0}
                            </span>{" "}
                            → {calculatedHolidayCount}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] border-red-300 text-red-700 bg-red-50 hover:bg-red-100"
                          onClick={updateHolidayCount}
                        >
                          Update
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="startDate" className="text-xs">
                Start Date <span className="text-gray-400 text-[10px]">(auto-calculated)</span>
              </Label>
              <div className="text-sm border p-1 rounded-md h-8 flex items-center text-xs bg-gray-50">
                {editingTask?.endDate
                  ? editingTask?.startDate
                    ? format(parseISO(editingTask.startDate), "MMM d, yyyy")
                    : "No date selected"
                  : ""}
              </div>
            </div>

            <div className="space-y-1 col-span-2">
              <Label htmlFor="notes" className="text-xs">
                Notes
              </Label>
              <Textarea
                id="notes"
                value={editingTask.notes}
                onChange={(e) => setEditingTask({ ...editingTask, notes: e.target.value })}
                className="h-16 resize-none text-sm"
                placeholder="Add notes..."
                disabled={isTaskCompleted()}
              />
            </div>

            {dateError && <div className="text-red-500 text-xs col-span-2">{dateError}</div>}

            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Color</Label>
              <div className="flex flex-wrap gap-1">
                {taskColors.map((color) => (
                  <div
                    key={color}
                    className={cn(
                      "w-5 h-5 rounded-full cursor-pointer",
                      color,
                      editingTask.color === color && "ring-2 ring-offset-1 ring-black",
                      isTaskCompleted() && "opacity-50 cursor-not-allowed",
                    )}
                    onClick={() => !isTaskCompleted() && setEditingTask({ ...editingTask, color })}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="p-3 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} size="sm">
            Cancel
          </Button>
          <Button
            onClick={() => {
              handleSave()
              // Don't close here - let the save process handle it
            }}
            size="sm"
            variant={isNewTask ? "outline" : "destructive"}
            className={isNewTask ? "bg-green-600 text-white hover:bg-green-700 hover:text-white" : ""}
          >
            {isNewTask ? "Create" : "Edit"}
          </Button>
        </div>
      </div>

      {/* Holiday Warning Dialog */}
      <HolidayWarningDialog
        isOpen={showWarningDialog}
        onClose={() => setShowWarningDialog(false)}
        onConfirm={() => {
          setShowWarningDialog(false)
          proceedWithSave()
        }}
        warnings={holidayWarnings}
      />
    </div>
  )
}

// Helper function to calculate days between dates
function differenceInDays(end: Date, start: Date): number {
  const diffTime = Math.abs(end.getTime() - start.getTime())
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}
