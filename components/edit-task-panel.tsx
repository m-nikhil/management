"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { format, parseISO, isBefore } from "date-fns"
import { CalendarIcon, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"

import type { Task } from "./calendar-with-tasks"
import { supabase } from "@/lib/supabase"
import { createLogEntry, saveLog } from "@/utils/history-logger"
import type { Holiday } from "@/app/actions/holiday-actions"

interface EditTaskPanelProps {
  task: Task | null
  onClose: () => void
  onSave: (updatedTask: Task) => void
  onDelete: (taskId: number) => void
  holidays?: Holiday[] // Add holidays prop
}

export function EditTaskPanel({ task, onClose, onSave, onDelete, holidays = [] }: EditTaskPanelProps) {
  const [editedTask, setEditedTask] = useState<Task | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const { toast } = useToast()

  // Initialize form with task data
  useEffect(() => {
    if (task) {
      setEditedTask({ ...task })
    }
  }, [task])

  if (!task || !editedTask) {
    return null
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setEditedTask((prev) => (prev ? { ...prev, [name]: value } : null))
  }

  // Updated date selection handlers based on the working logic from orders-table
  const handleStartDateSelect = (date: Date | undefined) => {
    if (!date) return
    const newStartDate = format(date, "yyyy-MM-dd")
    setEditedTask((prev) => (prev ? { ...prev, startDate: newStartDate } : null))
  }

  const handleEndDateSelect = (date: Date | undefined) => {
    if (!date) return
    const newEndDate = format(date, "yyyy-MM-dd")

    // Check if new end date is after due date
    const dueDate = parseISO(editedTask.dueDate)
    if (isBefore(dueDate, date)) {
      // If end date is after due date, set due date to match end date
      const newDueDate = format(date, "yyyy-MM-dd")
      setEditedTask((prev) => (prev ? { ...prev, endDate: newEndDate, dueDate: newDueDate } : null))

      toast({
        title: "Date Adjusted",
        description: "Due date has been updated to match the end date.",
      })
    } else {
      // Normal case - just update end date
      setEditedTask((prev) => (prev ? { ...prev, endDate: newEndDate } : null))
    }
  }

  const handleDueDateSelect = (date: Date | undefined) => {
    if (!date) return
    const newDueDate = format(date, "yyyy-MM-dd")

    // Check if due date is before end date
    const endDate = parseISO(editedTask.endDate)
    if (isBefore(date, endDate)) {
      // If due date is before end date, set end date to match due date
      setEditedTask((prev) => (prev ? { ...prev, dueDate: newDueDate, endDate: newDueDate } : null))

      toast({
        title: "Date Adjusted",
        description: "End date has been updated to match the due date.",
      })
    } else {
      // Normal case - just update due date
      setEditedTask((prev) => (prev ? { ...prev, dueDate: newDueDate } : null))
    }
  }

  const handleSave = async () => {
    if (!editedTask) return

    setIsSaving(true)
    try {
      // Update task in Supabase
      const { error } = await supabase
        .from("tasks")
        .update({
          order_number: editedTask.orderNumber,
          order_name: editedTask.orderName,
          start_date: editedTask.startDate,
          end_date: editedTask.endDate,
          due_date: editedTask.dueDate,
          notes: editedTask.notes,
          status: editedTask.status,
          // Add the days_to_complete field
          days_to_complete: editedTask.daysToComplete,
        })
        .eq("id", editedTask.id)

      if (error) {
        console.error("Error updating task:", error)
        toast({
          title: "Error",
          description: "Failed to update task. Please try again.",
          variant: "destructive",
        })
        return
      }

      // Log the action
      const logEntry = createLogEntry("modified", editedTask, "Task updated")
      saveLog(logEntry)

      // Try to save log to Supabase
      try {
        await supabase.from("logs").insert({
          id: logEntry.id,
          timestamp: logEntry.timestamp,
          action_type: logEntry.actionType,
          task_id: logEntry.taskId,
          order_number: logEntry.orderNumber,
          order_name: logEntry.orderName,
          details: logEntry.details,
          user_name: logEntry.userName,
        })
      } catch (logError) {
        console.error("Error saving log to Supabase:", logError)
      }

      onSave(editedTask)
    } catch (error) {
      console.error("Error in handleSave:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editedTask) return

    if (confirm(`Are you sure you want to delete task "${editedTask.orderName}"?`)) {
      setIsDeleting(true)
      try {
        // Delete task from Supabase
        const { error } = await supabase.from("tasks").delete().eq("id", editedTask.id)

        if (error) {
          console.error("Error deleting task:", error)
          toast({
            title: "Error",
            description: "Failed to delete task. Please try again.",
            variant: "destructive",
          })
          return
        }

        // Log the action
        const logEntry = createLogEntry("deleted", editedTask, "Task deleted")
        saveLog(logEntry)

        // Try to save log to Supabase
        try {
          await supabase.from("logs").insert({
            id: logEntry.id,
            timestamp: logEntry.timestamp,
            action_type: logEntry.actionType,
            task_id: logEntry.taskId,
            order_number: logEntry.orderNumber,
            order_name: logEntry.orderName,
            details: logEntry.details,
            user_name: logEntry.userName,
          })
        } catch (logError) {
          console.error("Error saving log to Supabase:", logError)
        }

        onDelete(editedTask.id)
        toast({
          title: "Success",
          description: "Task deleted successfully",
        })
      } catch (error) {
        console.error("Error in handleDelete:", error)
        toast({
          title: "Error",
          description: "An unexpected error occurred. Please try again.",
          variant: "destructive",
        })
      } finally {
        setIsDeleting(false)
      }
    }
  }

  // Calculate the number of holidays from the holidayDates array
  const numberOfHolidays = editedTask.holidayDates ? editedTask.holidayDates.length : 0

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l bg-background shadow-lg sm:max-w-md">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-lg font-semibold">Edit Task</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orderNumber">Order Number</Label>
            <Input
              id="orderNumber"
              name="orderNumber"
              value={editedTask.orderNumber}
              onChange={handleInputChange}
              placeholder="Enter order number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="orderName">Order Name</Label>
            <Input
              id="orderName"
              name="orderName"
              value={editedTask.orderName}
              onChange={handleInputChange}
              placeholder="Enter order name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="startDate">Start Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal" id="startDate">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(parseISO(editedTask.startDate), "MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={parseISO(editedTask.startDate)}
                  onSelect={handleStartDateSelect}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="endDate">End Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal" id="endDate">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(parseISO(editedTask.endDate), "MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={parseISO(editedTask.endDate)}
                  onSelect={handleEndDateSelect}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dueDate">Due Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal" id="dueDate">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(parseISO(editedTask.dueDate), "MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={parseISO(editedTask.dueDate)}
                  onSelect={handleDueDateSelect}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Input
              id="status"
              name="status"
              value={editedTask.status || ""}
              onChange={handleInputChange}
              placeholder="Enter status"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              value={editedTask.notes || ""}
              onChange={handleInputChange}
              placeholder="Enter notes"
              className="min-h-[100px]"
            />
          </div>

          {/* Display the number of holidays */}
          <div className="space-y-2">
            <Label htmlFor="numberOfHolidays">Number of Holidays</Label>
            <Input
              id="numberOfHolidays"
              name="numberOfHolidays"
              value={numberOfHolidays.toString()}
              readOnly // Make it read-only
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t p-4">
        <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
          {isDeleting ? "Deleting..." : "Delete"}
        </Button>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}
