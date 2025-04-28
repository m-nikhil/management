"use client"

import { useState, useEffect } from "react"
import { format, parseISO } from "date-fns"
import { Plus, Ban, RefreshCw, Calendar, Repeat, AlertCircle, Clock, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { HolidayForm } from "@/components/holiday-form"
import {
  getHolidays,
  cancelHoliday,
  clearCancelledHolidays,
  type Holiday,
  hasActiveRecurringHoliday,
  getExpiredHolidays,
} from "@/app/actions/holiday-actions"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getActiveAndFutureHolidays } from "@/app/actions/holiday-actions"

export default function HolidaysPage() {
  const [activeHolidays, setActiveHolidays] = useState<Holiday[]>([])
  const [canceledHolidays, setCanceledHolidays] = useState<Holiday[]>([])
  const [expiredHolidays, setExpiredHolidays] = useState<Holiday[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false)
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false)
  const [holidayToCancel, setHolidayToCancel] = useState<Holiday | null>(null)
  const { toast } = useToast()
  const [formMode, setFormMode] = useState<"holiday" | "workingday">("holiday")
  // Add a new state for showing a warning about existing recurring holidays
  const [recurringHolidayWarning, setRecurringHolidayWarning] = useState<string | null>(null)
  const [isClearing, setIsClearing] = useState(false)

  // Load holidays on component mount and ensure default holidays exist
  useEffect(() => {
    const initializeHolidays = async () => {
      fetchHolidays()
    }

    initializeHolidays()
  }, [])

  const fetchHolidays = async () => {
    try {
      setIsRefreshing(true)
      const result = await getHolidays()
      const activeResult = await getActiveAndFutureHolidays()
      const expiredResult = await getExpiredHolidays()

      if (result.success) {
        console.log("Fetched active holidays:", activeResult.data)
        console.log("Fetched cancelled holidays:", result.canceledData)
        console.log("Fetched expired holidays:", expiredResult.data)

        setActiveHolidays(activeResult.data || [])
        setCanceledHolidays(result.canceledData || [])
        setExpiredHolidays(expiredResult.data || [])
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to fetch holidays",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error fetching holidays:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  // Update the handleAddHoliday function to check for existing recurring holidays
  const handleAddHoliday = async () => {
    // Check if there's already an active recurring holiday
    const recurringCheck = await hasActiveRecurringHoliday()

    setIsFormOpen(true)
    setFormMode("holiday")

    // If there's an existing recurring holiday, show a warning
    if (recurringCheck.success && recurringCheck.hasRecurring && recurringCheck.recurringHoliday) {
      const existingHoliday = recurringCheck.recurringHoliday
      const dayName = getDayOfWeekName(existingHoliday.day_of_week || 0)
      setRecurringHolidayWarning(
        `Note: There is already an active recurring holiday (${existingHoliday.name}) set for every ${dayName}. ` +
          `Only one active recurring holiday can exist at a time.`,
      )
    } else {
      setRecurringHolidayWarning(null)
    }
  }

  const handleAddWorkingDayException = () => {
    // Pre-set the form for a working day
    setFormMode("workingday")
    setIsFormOpen(true)
  }

  const handleCancelClick = (holiday: Holiday) => {
    setHolidayToCancel(holiday)
    setIsCancelConfirmOpen(true)
  }

  // Add function to handle clearing cancelled holidays
  const handleClearCancelledHolidays = () => {
    setIsClearConfirmOpen(true)
  }

  // Add function to confirm and execute clearing cancelled holidays
  const handleClearConfirm = async () => {
    try {
      setIsClearing(true)
      const result = await clearCancelledHolidays()

      if (result.success) {
        toast({
          title: "Success",
          description: `Successfully cleared ${result.count} cancelled holidays`,
        })

        // Update local state to reflect the changes
        setCanceledHolidays([])
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to clear cancelled holidays",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error clearing cancelled holidays:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsClearing(false)
      setIsClearConfirmOpen(false)
    }
  }

  // Then update the handleCancelConfirm function to show warnings about affected tasks
  const handleCancelConfirm = async () => {
    if (!holidayToCancel) return

    try {
      const result = await cancelHoliday(holidayToCancel.id)

      if (result.success) {
        toast({
          title: isWorkingDay(holidayToCancel) ? "Working Day Cancelled" : "Holiday Cancelled",
          description: `Successfully cancelled ${isWorkingDay(holidayToCancel) ? "working day" : "holiday"}: ${holidayToCancel.name}`,
        })

        // Show warning if there are affected tasks
        if (result.hasAffectedTasks) {
          toast({
            title: "Tasks Need Update",
            description: `${result.affectedTaskCount} tasks may have incorrect holiday counts and should be reviewed.`,
            variant: "warning",
            duration: 8000, // Show for longer
          })
        }

        // Move from active to cancelled
        const cancelledHoliday = { ...holidayToCancel, cancelled: true }
        setActiveHolidays(activeHolidays.filter((h) => h.id !== holidayToCancel.id))
        setCanceledHolidays([cancelledHoliday, ...canceledHolidays])
      } else {
        toast({
          title: "Error",
          description: result.error || `Failed to cancel ${isWorkingDay(holidayToCancel) ? "working day" : "holiday"}`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error(`Error cancelling ${isWorkingDay(holidayToCancel) ? "working day" : "holiday"}:`, error)
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsCancelConfirmOpen(false)
      setHolidayToCancel(null)
    }
  }

  // Update the handleFormSuccess function to clear the warning
  const handleFormSuccess = () => {
    setIsFormOpen(false)
    setRecurringHolidayWarning(null)
    fetchHolidays()
  }

  const getDayOfWeekName = (dayNumber: number) => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    return days[dayNumber] || "Unknown"
  }

  const renderHolidayTable = (holidays: Holiday[], isCancelled = false, isExpired = false) => {
    if (holidays.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          <p>
            No {isCancelled ? "cancelled " : isExpired ? "past " : "present or upcoming "}holidays or working days
            found.
          </p>
        </div>
      )
    }

    return (
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="h-8">
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Date / Day</TableHead>
            {!isCancelled && !isExpired && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {holidays.map((holiday) => (
            <TableRow key={holiday.id} className="h-10">
              <TableCell className="font-medium py-1">
                <div className="flex items-center">{holiday.name}</div>
              </TableCell>
              <TableCell className="py-1">
                <div className="flex items-center">
                  {holiday.holiday_type === "specific_date" ? (
                    <>
                      <Calendar className="h-3.5 w-3.5 mr-1 text-blue-500" />
                      <span>Specific Date</span>
                    </>
                  ) : holiday.holiday_type === "exception" ? (
                    <>
                      <AlertCircle className="h-3.5 w-3.5 mr-1 text-amber-500" />
                      <span>{isWorkingDay(holiday) ? "Working Day Exception" : "Exception"}</span>
                    </>
                  ) : (
                    <>
                      <Repeat className="h-3.5 w-3.5 mr-1 text-green-500" />
                      <span>Weekly</span>
                      {holiday.start_from && (
                        <span className="ml-2 text-xs text-gray-500 flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          from {format(parseISO(holiday.start_from), "MMM d, yyyy")}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </TableCell>
              <TableCell className="py-1">
                {holiday.holiday_type === "specific_date" && holiday.specific_date
                  ? format(parseISO(holiday.specific_date), "MMMM d, yyyy")
                  : holiday.holiday_type === "exception" && holiday.specific_date
                    ? format(parseISO(holiday.specific_date), "MMMM d, yyyy")
                    : holiday.day_of_week !== null
                      ? getDayOfWeekName(holiday.day_of_week)
                      : "N/A"}
              </TableCell>
              {!isCancelled && !isExpired && (
                <TableCell className="text-right py-1">
                  <div className="flex justify-end space-x-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7"
                      onClick={() => handleCancelClick(holiday)}
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  const isWorkingDay = (holiday: Holiday | null | undefined) => {
    // Return false if holiday is null or undefined
    if (!holiday) return false

    return holiday.holiday_type === "exception"
  }

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Holidays & Working Days</CardTitle>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={fetchHolidays}
              className="flex items-center gap-1"
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button onClick={handleAddHoliday} className="flex items-center gap-1">
              <Plus className="h-4 w-4" />
              Add Holiday
            </Button>
            <Button
              onClick={handleAddWorkingDayException}
              variant="outline"
              className="flex items-center gap-1 border-green-500 text-green-600 hover:bg-green-50"
            >
              <Calendar className="h-4 w-4" />
              Add Working Day
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <Tabs defaultValue="active" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="active">Present & Upcoming</TabsTrigger>
                <TabsTrigger value="expired">Past Holidays</TabsTrigger>
                <TabsTrigger value="cancelled">Cancelled Items</TabsTrigger>
              </TabsList>
              <TabsContent value="active">{renderHolidayTable(activeHolidays)}</TabsContent>
              <TabsContent value="expired">{renderHolidayTable(expiredHolidays, false, true)}</TabsContent>
              <TabsContent value="cancelled">
                <div className="mb-4 flex justify-end">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleClearCancelledHolidays}
                    disabled={canceledHolidays.length === 0 || isClearing}
                    className="flex items-center gap-1"
                  >
                    <Trash2 className="h-4 w-4" />
                    {isClearing ? "Clearing..." : "Clear All Cancelled Holidays"}
                  </Button>
                </div>
                {renderHolidayTable(canceledHolidays, true)}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Add Holiday Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{`Add ${formMode === "holiday" ? "Holiday" : "Working Day"}`}</DialogTitle>
          </DialogHeader>
          {recurringHolidayWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">
              <div className="flex items-center text-amber-700">
                <AlertCircle className="h-4 w-4 mr-2" />
                <p className="text-sm">{recurringHolidayWarning}</p>
              </div>
            </div>
          )}
          <HolidayForm
            onSuccess={handleFormSuccess}
            onCancel={() => {
              setIsFormOpen(false)
              setRecurringHolidayWarning(null)
            }}
            mode={formMode}
          />
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={isCancelConfirmOpen} onOpenChange={setIsCancelConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Cancel</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>
              Are you sure you want to cancel the {isWorkingDay(holidayToCancel) ? "working day" : "holiday"} "
              {holidayToCancel?.name}"?
            </p>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsCancelConfirmOpen(false)}>
              No, Keep It
            </Button>
            <Button variant="destructive" onClick={handleCancelConfirm}>
              Yes, Cancel {isWorkingDay(holidayToCancel) ? "Working Day" : "Holiday"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clear Cancelled Holidays Confirmation Dialog */}
      <Dialog open={isClearConfirmOpen} onOpenChange={setIsClearConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Clear Cancelled Holidays</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>
              Are you sure you want to permanently delete all {canceledHolidays.length} cancelled holidays? This action
              cannot be undone.
            </p>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsClearConfirmOpen(false)}>
              No, Keep Them
            </Button>
            <Button variant="destructive" onClick={handleClearConfirm} disabled={isClearing}>
              {isClearing ? "Clearing..." : "Yes, Delete All"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
