import type { Task } from "@/components/calendar-with-tasks"

export type ActionType = "added" | "modified" | "deleted"

export interface LogEntry {
  id: string
  timestamp: string
  actionType: ActionType
  taskId: number
  orderNumber: string
  orderName: string
  details?: string
  userName?: string
}

// Helper function to create a new log entry
export function createLogEntry(actionType: ActionType, task: Task, details?: string, userName = "System"): LogEntry {
  return {
    id: generateId(),
    timestamp: new Date().toISOString(),
    actionType,
    taskId: task.id,
    orderNumber: task.orderNumber,
    orderName: task.orderName,
    details,
    userName,
  }
}

// Helper function to save logs to localStorage
export function saveLog(logEntry: LogEntry): void {
  try {
    // Get existing logs
    const existingLogs = getLogs()

    // Add new log to the beginning of the array
    const updatedLogs = [logEntry, ...existingLogs]

    // Save to localStorage
    localStorage.setItem("task_history_logs", JSON.stringify(updatedLogs))
  } catch (error) {
    console.error("Error saving log entry:", error)
  }
}

// Helper function to get all logs from localStorage
export function getLogs(): LogEntry[] {
  try {
    const logs = localStorage.getItem("task_history_logs")
    return logs ? JSON.parse(logs) : []
  } catch (error) {
    console.error("Error retrieving logs:", error)
    return []
  }
}

// Helper function to clear all logs
export function clearLogs(): void {
  try {
    localStorage.removeItem("task_history_logs")
    console.log("Local logs cleared successfully")
  } catch (error) {
    console.error("Error clearing logs:", error)
  }
}

// Generate a unique ID for log entries
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}
