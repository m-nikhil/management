"use client"

import { supabase } from "@/lib/supabase"
import { isBefore, isEqual, parseISO } from "date-fns"

export type Holiday = {
  id: number
  name: string
  holiday_type: "specific_date" | "day_of_week" | "exception"
  specific_date: string | null
  day_of_week: number | null
  start_from: string | null
  cancelled: boolean
  cancelled_date: string | null
  created_at?: string
  updated_at?: string
  workingday?: boolean
}

export type HolidayFormData = {
  name: string
  holiday_type: "specific_date" | "day_of_week" | "exception"
  specific_date?: string
  day_of_week?: number
  start_from?: string
}

// Helper function to determine if a holiday is a working day
export async function isWorkingDay(holiday: Holiday | null | undefined): Promise<boolean> {
  // Return false if holiday is null or undefined
  if (!holiday) return false

  return holiday.holiday_type === "exception"
}

// Get all holidays
export async function getHolidays() {
  try {
    console.log("Fetching holidays from database...")
    const { data, error } = await supabase.from("holidays").select("*").order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching holidays:", error)
      return { success: false, error: error.message, data: [], canceledData: [] }
    }

    console.log(`Fetched ${data?.length || 0} holidays from database`)

    // Log the data to see what's coming from the database
    console.log("Raw holiday data:", data)

    // Separate active and cancelled holidays
    const activeHolidays = data?.filter((holiday) => !holiday.cancelled) || []
    const cancelledHolidays = data?.filter((holiday) => holiday.cancelled) || []

    // Log the filtered data
    console.log("Active holidays:", activeHolidays)
    console.log("Cancelled holidays:", cancelledHolidays)

    return {
      success: true,
      data: activeHolidays,
      canceledData: cancelledHolidays,
    }
  } catch (error) {
    console.error("Error in getHolidays:", error)
    return { success: false, error: "Failed to fetch holidays", data: [], canceledData: [] }
  }
}

// Get only active and future holidays
export async function getActiveAndFutureHolidays() {
  try {
    console.log("Fetching active and future holidays...")
    const today = new Date().toISOString().split("T")[0] // Format as YYYY-MM-DD

    // Query for holidays that are:
    // 1. Not cancelled
    // 2. Either specific dates today or in the future, or recurring weekly holidays
    const { data, error } = await supabase
      .from("holidays")
      .select("*")
      .eq("cancelled", false)
      .or(`specific_date.gte.${today},holiday_type.eq.day_of_week`)

    if (error) {
      console.error("Error fetching holidays:", error)
      return { success: false, error: error.message, data: [] }
    }

    console.log(`Fetched ${data?.length || 0} active and future holidays`)
    return { success: true, data: data || [] }
  } catch (error) {
    console.error("Error in getActiveAndFutureHolidays:", error)
    return { success: false, error: "Failed to fetch holidays", data: [] }
  }
}

// Update the getExpiredHolidays function to include only past holidays that aren't cancelled
export async function getExpiredHolidays() {
  try {
    console.log("Fetching expired holidays...")
    const today = new Date().toISOString().split("T")[0] // Format as YYYY-MM-DD

    // Query for holidays that are:
    // 1. Not cancelled
    // 2. Specific dates in the past
    const { data, error } = await supabase
      .from("holidays")
      .select("*")
      .eq("cancelled", false)
      .eq("holiday_type", "specific_date")
      .lt("specific_date", today)
      .order("specific_date", { ascending: false })

    if (error) {
      console.error("Error fetching expired holidays:", error)
      return { success: false, error: error.message, data: [] }
    }

    // Also get expired working day exceptions
    const { data: expiredExceptions, error: exceptionsError } = await supabase
      .from("holidays")
      .select("*")
      .eq("cancelled", false)
      .eq("holiday_type", "exception")
      .lt("specific_date", today)
      .order("specific_date", { ascending: false })

    if (exceptionsError) {
      console.error("Error fetching expired exceptions:", exceptionsError)
      return { success: false, error: exceptionsError.message, data: data || [] }
    }

    // Combine both types of expired items
    const allExpired = [...(data || []), ...(expiredExceptions || [])]

    console.log(`Fetched ${allExpired.length} expired holidays`)
    return { success: true, data: allExpired }
  } catch (error) {
    console.error("Error in getExpiredHolidays:", error)
    return { success: false, error: "Failed to fetch expired holidays", data: [] }
  }
}

// Add this new function after getActiveAndFutureHolidays
export async function hasActiveRecurringHoliday() {
  try {
    console.log("Checking for active recurring holidays...")

    // Query for active recurring holidays
    const { data, error } = await supabase
      .from("holidays")
      .select("*")
      .eq("cancelled", false)
      .eq("holiday_type", "day_of_week")

    if (error) {
      console.error("Error checking recurring holidays:", error)
      return { success: false, error: error.message, hasRecurring: false }
    }

    return {
      success: true,
      hasRecurring: data && data.length > 0,
      recurringHoliday: data && data.length > 0 ? data[0] : null,
    }
  } catch (error) {
    console.error("Error in hasActiveRecurringHoliday:", error)
    return { success: false, error: "Failed to check recurring holidays", hasRecurring: false }
  }
}

// Create a new holiday
export async function createHoliday(formData: HolidayFormData) {
  try {
    // Validate input
    if (!formData.name || !formData.holiday_type) {
      return { success: false, error: "Name and holiday type are required" }
    }

    if (formData.holiday_type === "specific_date" && !formData.specific_date) {
      return { success: false, error: "Date is required for specific date holidays" }
    }

    if (formData.holiday_type === "day_of_week" && formData.day_of_week === undefined) {
      return { success: false, error: "Day of week is required for recurring holidays" }
    }

    if (formData.holiday_type === "exception" && !formData.specific_date) {
      return { success: false, error: "Date is required for exceptions" }
    }

    // Check if there's already an active recurring holiday when trying to create a new one
    if (formData.holiday_type === "day_of_week") {
      const recurringCheck = await hasActiveRecurringHoliday()
      if (recurringCheck.success && recurringCheck.hasRecurring) {
        return {
          success: false,
          error:
            "Only one active recurring holiday can exist at a time. Please cancel the existing recurring holiday first.",
          existingHoliday: recurringCheck.recurringHoliday,
        }
      }
    }

    // For specific_date type, set start_from to the same as specific_date
    let startFrom = formData.start_from
    if (formData.holiday_type === "specific_date" && formData.specific_date) {
      startFrom = formData.specific_date
    }

    // For day_of_week type, start_from is required
    if (formData.holiday_type === "day_of_week" && !startFrom) {
      // Default to today if not provided
      startFrom = new Date().toISOString().split("T")[0]
    }

    // Prepare data for insertion
    const holidayData = {
      name: formData.name,
      holiday_type: formData.holiday_type,
      specific_date:
        formData.holiday_type === "specific_date" || formData.holiday_type === "exception"
          ? formData.specific_date
          : null,
      day_of_week: formData.holiday_type === "day_of_week" ? formData.day_of_week : null,
      start_from: startFrom,
      cancelled: false,
      cancelled_date: null,
    }

    console.log("Creating holiday with data:", holidayData)

    // Insert into database
    const { data, error } = await supabase.from("holidays").insert(holidayData).select()

    if (error) {
      console.error("Error creating holiday:", error)
      return { success: false, error: error.message }
    }

    console.log("Created holiday:", data)

    // For client-side, we'll trigger a refresh instead of using revalidatePath
    window.dispatchEvent(new CustomEvent("holiday-created"))

    return { success: true, data: data[0] }
  } catch (error) {
    console.error("Error in createHoliday:", error)
    return { success: false, error: "Failed to create holiday" }
  }
}

// Check if a date is a holiday
export async function isDateHoliday(dateStr: string) {
  try {
    const date = parseISO(dateStr)
    const dayOfWeek = date.getDay() // 0 = Sunday, 1 = Monday, etc.

    // Check for specific date holidays or exceptions on this date
    const { data: specificHolidays, error: specificError } = await supabase
      .from("holidays")
      .select("*")
      .eq("specific_date", dateStr)
      .eq("cancelled", false)

    if (specificError) {
      console.error("Error checking specific date holidays:", specificError)
      return { isHoliday: false, error: specificError.message }
    }

    // If there's a working day exception for this date, it's not a holiday
    const hasWorkingDay = specificHolidays?.some((h) => h.holiday_type === "exception")
    if (hasWorkingDay) {
      return { isHoliday: false }
    }

    // If there's a specific date holiday, it is a holiday
    const hasSpecificDateHoliday = specificHolidays?.some((h) => h.holiday_type === "specific_date")
    if (hasSpecificDateHoliday) {
      return { isHoliday: true }
    }

    // Check for recurring day of week holidays
    const { data: recurringHolidays, error: recurringError } = await supabase
      .from("holidays")
      .select("*")
      .eq("day_of_week", dayOfWeek)
      .eq("holiday_type", "day_of_week")
      .eq("cancelled", false)

    if (recurringError) {
      console.error("Error checking recurring holidays:", recurringError)
      return { isHoliday: false, error: recurringError.message }
    }

    // Check if any recurring holiday applies to this date (based on start_from and cancelled_date)
    const applicableRecurringHoliday = recurringHolidays?.some((h) => {
      // If no start_from date is specified, this recurring holiday doesn't apply
      if (!h.start_from) return false

      const startFrom = parseISO(h.start_from)
      const dateToCheck = parseISO(dateStr)

      // Check if date is on or after start_from
      // This is the critical part - we need to ensure the date is on or after the start_from date
      const isAfterStart = isBefore(startFrom, dateToCheck) || isEqual(startFrom, dateToCheck)

      if (!isAfterStart) return false

      // Check if date is before cancelled_date (if holiday is cancelled)
      if (h.cancelled && h.cancelled_date) {
        const cancellationDate = parseISO(h.cancelled_date)
        return isBefore(dateToCheck, cancellationDate)
      }

      return true
    })

    return { isHoliday: !!applicableRecurringHoliday }
  } catch (error) {
    console.error("Error in isDateHoliday:", error)
    return { isHoliday: false, error: "Failed to check if date is a holiday" }
  }
}

// Function to find tasks affected by a holiday
async function findTasksAffectedByHoliday(holiday: Holiday) {
  try {
    console.log(`Checking for affected tasks for holiday ID: ${holiday.id}`)

    let query = supabase.from("tasks").select("*")

    if (holiday.holiday_type === "specific_date" && holiday.specific_date) {
      // Find tasks due on the specific date
      query = query.eq("due_date", holiday.specific_date)
    } else if (holiday.holiday_type === "day_of_week" && holiday.day_of_week !== null && holiday.start_from) {
      // Find tasks due on the recurring day of the week, starting from start_from
      const dayOfWeek = holiday.day_of_week
      const startFrom = parseISO(holiday.start_from)

      // Get all tasks and filter in the server action
      const { data: allTasks, error: allTasksError } = await supabase.from("tasks").select("*")

      if (allTasksError) {
        console.error("Error fetching all tasks:", allTasksError)
        return { success: false, error: allTasksError.message, affectedTasks: [] }
      }

      const affectedTasks =
        allTasks?.filter((task) => {
          if (!task.due_date) return false // Skip tasks without a due date

          const taskDueDate = parseISO(task.due_date)
          const taskDayOfWeek = taskDueDate.getDay()

          // Check if the task's due date falls on the same day of the week as the recurring holiday
          if (taskDayOfWeek === dayOfWeek) {
            // Check if the task's due date is on or after the holiday's start date
            return isBefore(startFrom, taskDueDate) || isEqual(startFrom, taskDueDate)
          }

          return false
        }) || []

      console.log(`Found ${affectedTasks.length} affected tasks for recurring holiday ID: ${holiday.id}`)
      return { success: true, affectedTasks: affectedTasks }
    } else if (holiday.holiday_type === "exception" && holiday.specific_date) {
      query = query.eq("due_date", holiday.specific_date)
    } else {
      console.log("No specific or recurring date provided for the holiday.")
      return { success: true, affectedTasks: [] }
    }

    const { data, error } = await query

    if (error) {
      console.error("Error fetching affected tasks:", error)
      return { success: false, error: error.message, affectedTasks: [] }
    }

    console.log(`Found ${data?.length || 0} affected tasks for holiday ID: ${holiday.id}`)
    return { success: true, affectedTasks: data || [] }
  } catch (error) {
    console.error("Error in findTasksAffectedByHoliday:", error)
    return { success: false, error: "Failed to find affected tasks", affectedTasks: [] }
  }
}

// Update the cancelHoliday function to prevent cancelling past holidays
export async function cancelHoliday(id: number) {
  try {
    // First, get the holiday to check its date
    const { data, error: fetchError } = await supabase.from("holidays").select("*").eq("id", id).single()

    if (fetchError) {
      console.error("Error fetching holiday:", fetchError)
      return { success: false, error: fetchError.message }
    }

    if (!data) {
      return { success: false, error: "Holiday not found" }
    }

    // Check if this is a past holiday (specific date in the past)
    if (data.holiday_type === "specific_date" && data.specific_date) {
      const holidayDate = parseISO(data.specific_date)
      const today = new Date()
      today.setHours(0, 0, 0, 0) // Set to beginning of day for fair comparison

      if (isBefore(holidayDate, today)) {
        return {
          success: false,
          error: "Cannot cancel past holidays. They are part of historical record.",
        }
      }
    }

    // Check for affected tasks before proceeding
    const { affectedTasks, success: checkSuccess } = await findTasksAffectedByHoliday(data)

    // Always mark as cancelled instead of deleting, regardless of date
    console.log(`Marking holiday as cancelled: ${data.name} (ID: ${id})`)
    const cancellationDate = new Date().toISOString().split("T")[0] // Get current date in YYYY-MM-DD format

    const { error: updateError } = await supabase
      .from("holidays")
      .update({
        cancelled: true,
        cancelled_date: cancellationDate, // Store the cancellation date
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (updateError) {
      console.error("Error cancelling holiday:", updateError)
      return { success: false, error: updateError.message }
    }

    // For client-side, we'll trigger a refresh instead of using revalidatePath
    window.dispatchEvent(new CustomEvent("holiday-cancelled"))

    return {
      success: true,
      wasDeleted: false, // Always false now since we're not deleting
      affectedTaskCount: affectedTasks?.length || 0,
      hasAffectedTasks: (affectedTasks?.length || 0) > 0,
    }
  } catch (error) {
    console.error("Error in cancelHoliday:", error)
    return { success: false, error: "Failed to cancel holiday" }
  }
}

// Delete a holiday (kept for backward compatibility)
export async function deleteHoliday(id: number) {
  return cancelHoliday(id)
}

// Add this new function to clear cancelled holidays
export async function clearCancelledHolidays() {
  try {
    console.log("Clearing cancelled holidays from database...")

    // Delete all holidays where cancelled = true
    const { data, error } = await supabase.from("holidays").delete().eq("cancelled", true).select()

    if (error) {
      console.error("Error clearing cancelled holidays:", error)
      return { success: false, error: error.message, count: 0 }
    }

    const deletedCount = data?.length || 0
    console.log(`Cleared ${deletedCount} cancelled holidays from database`)

    // For client-side, we'll trigger a refresh
    window.dispatchEvent(new CustomEvent("holidays-cleared"))

    return { success: true, count: deletedCount }
  } catch (error) {
    console.error("Error in clearCancelledHolidays:", error)
    return { success: false, error: "Failed to clear cancelled holidays", count: 0 }
  }
}
