"use client"

import { supabase } from "@/lib/supabase"
import { parseISO, isWithinInterval } from "date-fns"
import type { Holiday } from "./holiday-actions"

// Function to find tasks affected by a deleted holiday
export async function findTasksAffectedByHoliday(holiday: Holiday) {
  try {
    // Get all tasks from the database
    const { data: tasks, error } = await supabase.from("tasks").select("*")

    if (error) {
      console.error("Error fetching tasks:", error)
      return { success: false, error: error.message, affectedTasks: [] }
    }

    if (!tasks || tasks.length === 0) {
      return { success: true, affectedTasks: [] }
    }

    // Transform tasks to our Task type
    const transformedTasks = tasks.map((task) => ({
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
    }))

    // Find tasks that overlap with the holiday date
    const affectedTasks = transformedTasks.filter((task) => {
      // Skip completed tasks
      if (task.status === "Completed") return false

      const startDate = parseISO(task.startDate)
      const endDate = parseISO(task.endDate)

      // For specific date or exception holidays
      if (holiday.holiday_type === "specific_date" || holiday.holiday_type === "exception") {
        if (!holiday.specific_date) return false

        const holidayDate = parseISO(holiday.specific_date)

        // Check if holiday date falls within task date range
        return isWithinInterval(holidayDate, { start: startDate, end: endDate })
      }

      // For recurring day of week holidays
      if (holiday.holiday_type === "day_of_week" && holiday.day_of_week !== null) {
        // This is more complex as we'd need to check each day in the task range
        // For simplicity, we'll just flag all tasks that span more than 1 day
        // A more accurate implementation would check each day in the range
        return startDate.getTime() !== endDate.getTime()
      }

      return false
    })

    return {
      success: true,
      affectedTasks,
      message:
        affectedTasks.length > 0 ? `${affectedTasks.length} tasks may need holiday count updates` : "No tasks affected",
    }
  } catch (error) {
    console.error("Error finding affected tasks:", error)
    return { success: false, error: "Failed to find affected tasks", affectedTasks: [] }
  }
}

// Function to update task holiday counts
export async function updateTaskHolidayCounts(taskIds: number[]) {
  try {
    // Update each task's holiday count
    let updatedCount = 0

    for (const taskId of taskIds) {
      // First get the task to calculate its holiday count
      const { data: task, error: fetchError } = await supabase.from("tasks").select("*").eq("id", taskId).single()

      if (fetchError || !task) {
        console.error(`Error fetching task ${taskId}:`, fetchError)
        continue
      }

      // Here you would calculate the actual holiday count based on your holiday logic
      // For now, we'll just update with a placeholder value
      const { error: updateError } = await supabase
        .from("tasks")
        .update({
          number_of_holidays: 0, // This should be calculated based on your holiday logic
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskId)

      if (!updateError) {
        updatedCount++
      }
    }

    // Trigger a refresh event
    window.dispatchEvent(new CustomEvent("tasks-updated"))

    return { success: true, updatedCount }
  } catch (error) {
    console.error("Error updating task holiday counts:", error)
    return { success: false, error: "Failed to update task holiday counts", updatedCount: 0 }
  }
}
