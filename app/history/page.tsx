"use client"
import { useState, useEffect } from "react"
import { format, parseISO } from "date-fns"
import { Plus, Edit, Trash, Search, RefreshCw, Clock, FileText, Tag, Filter } from "lucide-react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/components/ui/use-toast"

import { type LogEntry, type ActionType, getLogs, clearLogs } from "@/utils/history-logger"
import { supabase } from "@/lib/supabase"

export default function HistoryPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [actionFilter, setActionFilter] = useState<ActionType | "all">("all")
  const [isLoading, setIsLoading] = useState(true)
  const [isClearingLogs, setIsClearingLogs] = useState(false)
  const { toast } = useToast()

  // Set up a subscription to listen for changes in the logs table
  useEffect(() => {
    try {
      const subscription = supabase
        .channel("logs-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "logs" }, (payload) => {
          console.log("Log change received!", payload)
          // Refresh logs when a change is detected
          loadLogs()
        })
        .subscribe()

      return () => {
        subscription.unsubscribe()
      }
    } catch (error) {
      console.error("Error setting up subscription:", error)
    }
  }, [])

  // Load logs on component mount
  useEffect(() => {
    loadLogs()

    // Set up a refresh interval to keep data in sync
    const refreshInterval = setInterval(() => {
      loadLogs()
    }, 30000) // Refresh every 30 seconds

    // Clean up interval on unmount
    return () => clearInterval(refreshInterval)
  }, [])

  // Filter logs when search query or action filter changes
  useEffect(() => {
    filterLogs()
  }, [logs, searchQuery, actionFilter])

  // Add better error handling for resource loading
  useEffect(() => {
    // Add proper error handling for any resource loading
    const handleResourceError = (event: ErrorEvent) => {
      console.error("Resource loading error:", event)
      // Prevent the error from showing in the console
      event.preventDefault()
    }

    window.addEventListener("error", handleResourceError, { capture: true })

    return () => {
      window.removeEventListener("error", handleResourceError, { capture: true })
    }
  }, [])

  // Load logs from Supabase
  const loadLogs = async () => {
    setIsLoading(true)
    try {
      // First try to load from Supabase
      const { data, error } = await supabase.from("logs").select("*").order("timestamp", { ascending: false })

      if (error) {
        console.error("Error loading logs from Supabase:", error)
        // Fall back to localStorage
        const localLogs = getLogs()
        setLogs(localLogs)
        return
      }

      if (data && data.length > 0) {
        // Transform the data to match our LogEntry type
        const transformedLogs = data.map((log) => ({
          id: log.id,
          timestamp: log.timestamp,
          actionType: log.action_type as ActionType,
          taskId: log.task_id,
          orderNumber: log.order_number,
          orderName: log.order_name,
          details: log.details,
          userName: log.user_name,
        }))

        setLogs(transformedLogs)
        return
      }

      // Fall back to localStorage if no Supabase data
      const localLogs = getLogs()
      setLogs(localLogs)
    } catch (error) {
      console.error("Error loading logs:", error)
      // Fall back to localStorage
      const localLogs = getLogs()
      setLogs(localLogs)
    } finally {
      setIsLoading(false)
    }
  }

  // Filter logs based on search query and action filter
  const filterLogs = () => {
    let filtered = [...logs]

    // Filter by action type
    if (actionFilter !== "all") {
      filtered = filtered.filter((log) => log.actionType === actionFilter)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (log) =>
          log.orderNumber.toLowerCase().includes(query) ||
          log.orderName.toLowerCase().includes(query) ||
          (log.details && log.details.toLowerCase().includes(query)) ||
          (log.userName && log.userName.toLowerCase().includes(query)),
      )
    }

    setFilteredLogs(filtered)
  }

  // Handle clearing all logs
  const handleClearLogs = async () => {
    if (confirm("Are you sure you want to clear all history logs? This action cannot be undone.")) {
      setIsClearingLogs(true)
      try {
        // Clear logs from localStorage first for immediate UI feedback
        clearLogs()

        // Update UI immediately
        setLogs([])
        setFilteredLogs([])

        // Try to clear logs from database
        try {
          // Since we can't use a simple condition for all records with UUID,
          // we'll delete logs one by one which is safer
          let successCount = 0
          let failCount = 0
          let dbLogs = []

          // First get all logs from the database
          const { data, error: fetchError } = await supabase.from("logs").select("id")

          if (fetchError) {
            console.error("Error fetching logs for deletion:", fetchError)
            toast({
              title: "Local Only",
              description: "Logs cleared from local storage only. Could not fetch logs from database.",
              variant: "warning",
            })
            return
          }

          dbLogs = data || []
          console.log(`Found ${dbLogs.length} logs to delete`)

          // Delete each log individually
          for (const log of dbLogs) {
            try {
              const { error: deleteError } = await supabase.from("logs").delete().eq("id", log.id)

              if (deleteError) {
                console.error(`Error deleting log ${log.id}:`, deleteError)
                failCount++
              } else {
                successCount++
              }
            } catch (individualError) {
              console.error(`Exception deleting log ${log.id}:`, individualError)
              failCount++
            }
          }

          if (failCount > 0) {
            toast({
              title: "Partial Success",
              description: `Cleared ${successCount} logs, but failed to delete ${failCount} logs from database.`,
              variant: "warning",
            })
          } else if (successCount > 0) {
            toast({
              title: "Success",
              description: `All ${successCount} logs have been cleared`,
            })
          } else {
            toast({
              title: "Local Only",
              description: "Logs cleared from local storage only. No logs were deleted from database.",
              variant: "warning",
            })
          }
        } catch (dbError) {
          console.error("Database error during clear logs:", dbError)
          toast({
            title: "Local Only",
            description: "Logs cleared from local storage only. Database operation failed.",
            variant: "warning",
          })
        }
      } catch (error) {
        console.error("Error clearing logs:", error)
        toast({
          title: "Error",
          description: "Failed to clear logs. Please try again.",
          variant: "destructive",
        })
      } finally {
        setIsClearingLogs(false)
      }
    }
  }

  // Get icon for action type
  const getActionIcon = (actionType: ActionType) => {
    switch (actionType) {
      case "added":
        return <Plus className="h-4 w-4" />
      case "modified":
        return <Edit className="h-4 w-4" />
      case "deleted":
        return <Trash className="h-4 w-4" />
      default:
        return null
    }
  }

  // Get color for action type
  const getActionColor = (actionType: ActionType) => {
    switch (actionType) {
      case "added":
        return "bg-green-100 text-green-800 border-green-200"
      case "modified":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "deleted":
        return "bg-red-100 text-red-800 border-red-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    try {
      return format(parseISO(timestamp), "MMM d, yyyy 'at' h:mm a")
    } catch (error) {
      return timestamp
    }
  }

  return (
    <div className="container mx-auto py-6">
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Task History</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={loadLogs}
              className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white"
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearLogs}
              className="flex items-center gap-1"
              disabled={logs.length === 0 || isLoading || isClearingLogs}
            >
              <Trash className={`h-4 w-4 ${isClearingLogs ? "animate-spin" : ""}`} />
              {isClearingLogs ? "Clearing..." : "Clear History"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by order number, name, or details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="w-full md:w-64">
            <Select value={actionFilter} onValueChange={(value) => setActionFilter(value as ActionType | "all")}>
              <SelectTrigger className="w-full">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <SelectValue placeholder="Filter by action" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="added">Added</SelectItem>
                <SelectItem value="modified">Modified</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {logs.length === 0 ? (
              <p>No history logs found. Actions on tasks will be recorded here.</p>
            ) : (
              <p>No logs match your search criteria. Try adjusting your filters.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredLogs.map((log) => (
              <div key={log.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Badge className={`flex items-center gap-1 ${getActionColor(log.actionType)}`}>
                      {getActionIcon(log.actionType)}
                      {log.actionType.charAt(0).toUpperCase() + log.actionType.slice(1)}
                    </Badge>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center text-gray-500 text-sm">
                            <Clock className="h-3.5 w-3.5 mr-1" />
                            {formatTimestamp(log.timestamp)}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Exact time: {new Date(log.timestamp).toLocaleString()}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-2 mb-2">
                  <div className="flex items-center gap-1">
                    <Tag className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">{log.orderNumber}</span>
                  </div>
                  <div className="hidden md:block text-gray-400">•</div>
                  <div className="flex items-center gap-1">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span>{log.orderName}</span>
                  </div>
                </div>

                {log.details && (
                  <div className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
                    {log.details}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 text-sm text-gray-500 flex justify-between items-center">
          <div>
            Showing {filteredLogs.length} of {logs.length} logs
          </div>
        </div>
      </Card>
    </div>
  )
}
