"use client"
import { useState, useEffect } from "react"
import { OrdersTable } from "@/components/orders-table"
import type { Task } from "@/components/calendar-with-tasks"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/ui/use-toast"
import { parseISO, isBefore } from "date-fns"

// Update the OverdueTasksPage component to fetch and pass holidays to OrdersTable
// Add this after the existing imports
import { getActiveAndFutureHolidays } from "@/app/actions/holiday-actions"
import type { Holiday } from "@/app/actions/holiday-actions"

export default function OverdueTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  // Add this state variable with the other state declarations
  const [holidays, setHolidays] = useState<Holiday[]>([])

  // Load tasks from Supabase on component mount
  useEffect(() => {
    fetchTasks()
    fetchHolidays()
  }, [])

  const fetchTasks = async () => {
    try {
      setIsLoading(true)
      console.log("Fetching tasks from database...")
      const { data, error } = await supabase.from("tasks").select("*").order("due_date", { ascending: true })

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

        // Filter tasks: non-completed and overdue
        filterOverdueTasks(transformedTasks)
      } else {
        setTasks([])
        setFilteredTasks([])
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

  // Update the filterOverdueTasks function to ensure it only shows non-completed tasks with past due dates
  const filterOverdueTasks = (allTasks: Task[]) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Set to beginning of day

    const overdue = allTasks.filter((task) => {
      // Only include non-completed tasks
      if (task.status === "Completed") return false

      // Check if due date is before today
      const dueDate = parseISO(task.dueDate)
      return isBefore(dueDate, today)
    })

    setFilteredTasks(overdue)
  }

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Overdue Tasks</h1>
        <p className="text-gray-500">Non-completed tasks that are past their due date</p>
      </div>

      <div className="h-[calc(100vh-200px)]">
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-gray-500">Loading tasks...</span>
          </div>
        ) : (
          <>
            {filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xl font-medium text-gray-500">No overdue tasks</p>
                <p className="text-gray-400 mt-2">All tasks are either completed or not yet due</p>
              </div>
            ) : (
              <OrdersTable
                tasks={filteredTasks}
                hideExcelDownload={true}
                hideCompletedToggle={true}
                holidays={holidays}
                setTasks={(updatedTasks) => {
                  console.log("hideCompletedToggle prop being passed as:", true)
                  // When a task is updated in the OrdersTable, we need to update both
                  // the filtered tasks and the full tasks list
                  setFilteredTasks(updatedTasks)

                  // Find the tasks that were updated and update them in the full list
                  const updatedIds = new Set(updatedTasks.map((t) => t.id))
                  const remainingTasks = tasks.filter((t) => !updatedIds.has(t.id))
                  setTasks([...remainingTasks, ...updatedTasks])

                  // Re-filter the tasks in case status changed
                  filterOverdueTasks([...remainingTasks, ...updatedTasks])
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
