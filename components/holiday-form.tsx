"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { format, isBefore } from "date-fns"
import { CalendarIcon, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { createHoliday, isDateHoliday, type HolidayFormData } from "@/app/actions/holiday-actions"
import { useToast } from "@/components/ui/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface HolidayFormProps {
  onSuccess: () => void
  onCancel: () => void
  mode: "holiday" | "workingday"
}

export function HolidayForm({ onSuccess, onCancel, mode = "holiday" }: HolidayFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<HolidayFormData>({
    name: "",
    holiday_type: mode === "holiday" ? "specific_date" : "exception",
    specific_date: undefined,
    day_of_week: 0,
    start_from: undefined,
  })
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [startFromDate, setStartFromDate] = useState<Date | undefined>(new Date())
  const [isDateHolidayResult, setIsDateHolidayResult] = useState<boolean | null>(null)
  const [isCheckingDate, setIsCheckingDate] = useState(false)
  const { toast } = useToast()
  const [dateError, setDateError] = useState<string | null>(null)
  const [startFromDateError, setStartFromDateError] = useState<string | null>(null)

  // Set today's date as the default start_from date for recurring holidays
  useEffect(() => {
    console.log("Initial form data:", formData)
    console.log("Mode:", mode)

    // Set today's date as the default start_from date for recurring holidays
    if (formData.holiday_type === "day_of_week" && !formData.start_from) {
      const today = new Date()
      const todayStr = format(today, "yyyy-MM-dd")
      setStartFromDate(today)
      setFormData((prev) => ({
        ...prev,
        start_from: todayStr,
      }))
    }
  }, [formData, mode])

  // Check if the selected date is a holiday when adding a working day
  useEffect(() => {
    const checkIfDateIsHoliday = async () => {
      if (mode === "workingday" && formData.specific_date) {
        setIsCheckingDate(true)
        try {
          const result = await isDateHoliday(formData.specific_date)
          console.log("Is date holiday result:", result)
          setIsDateHolidayResult(result.isHoliday)
        } catch (error) {
          console.error("Error checking if date is holiday:", error)
        } finally {
          setIsCheckingDate(false)
        }
      } else {
        setIsDateHolidayResult(null)
      }
    }

    checkIfDateIsHoliday()
  }, [formData.specific_date, mode])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Don't submit if there's a date error
    if (dateError) {
      toast({
        title: "Error",
        description: dateError,
        variant: "destructive",
      })
      return
    }

    // For working days, prevent submission if the date is not a holiday
    if (mode === "workingday" && isDateHolidayResult === false) {
      toast({
        title: "Error",
        description: "Working days can only be added for dates that are normally holidays.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      // Set holiday_type based on the mode - working days are always exceptions
      const dataToSubmit = {
        ...formData,
        holiday_type: mode === "workingday" ? "exception" : formData.holiday_type,
      }

      console.log("Submitting form data:", dataToSubmit)

      const result = await createHoliday(dataToSubmit)

      if (result.success) {
        toast({
          title: `${mode === "holiday" ? "Holiday" : "Working Day"} Created`,
          description: `Successfully created ${mode === "holiday" ? "holiday" : "working day"}: ${formData.name}`,
        })
        onSuccess()
      } else {
        // Check if the error is due to an existing recurring holiday
        if (result.existingHoliday) {
          toast({
            title: "Error",
            description:
              "Only one active recurring holiday can exist at a time. Please cancel the existing recurring holiday first.",
            variant: "destructive",
          })
        } else {
          toast({
            title: "Error",
            description: result.error || `Failed to save ${mode === "holiday" ? "holiday" : "working day"}`,
            variant: "destructive",
          })
        }
      }
    } catch (error) {
      console.error(`Error saving ${mode === "holiday" ? "holiday" : "working day"}:`, error)
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDateChange = (date: Date | undefined) => {
    setDate(date)
    if (date) {
      // Check if the selected date is in the past (before today)
      const today = new Date()
      today.setHours(0, 0, 0, 0) // Set to beginning of day for fair comparison

      if (isBefore(date, today)) {
        // If date is in the past, show error and don't update form data
        setDateError("Cannot select a date in the past. Please choose today or a future date.")
        return
      } else {
        // Clear any existing date error
        setDateError(null)
      }

      // Fix: Use the exact date without any timezone adjustments
      const formattedDate = format(date, "yyyy-MM-dd")
      console.log("Selected date:", date)
      console.log("Formatted date string:", formattedDate)

      setFormData({
        ...formData,
        specific_date: formattedDate,
      })
    }
  }

  const dayOfWeekOptions = [
    { value: 0, label: "Sunday" },
    { value: 1, label: "Monday" },
    { value: 2, label: "Tuesday" },
    { value: 3, label: "Wednesday" },
    { value: 4, label: "Thursday" },
    { value: 5, label: "Friday" },
    { value: 6, label: "Saturday" },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{mode === "holiday" ? "Holiday Name" : "Working Day Name"}</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={`Enter ${mode === "holiday" ? "holiday" : "working day"} name`}
          required
        />
      </div>

      {mode === "holiday" && (
        <div className="space-y-2">
          <Label>Holiday Type</Label>
          <RadioGroup
            value={formData.holiday_type}
            onValueChange={(value) =>
              setFormData({
                ...formData,
                holiday_type: value as "specific_date" | "day_of_week",
              })
            }
            className="flex flex-col space-y-1"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="specific_date" id="specific_date" />
              <Label htmlFor="specific_date" className="cursor-pointer">
                Specific Date
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="day_of_week" id="day_of_week" />
              <Label htmlFor="day_of_week" className="cursor-pointer">
                Day of Week (Recurring)
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}

      {(mode === "workingday" || formData.holiday_type === "specific_date") && (
        <div className="space-y-2">
          <Label>Select Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !date && "text-muted-foreground",
                  dateError && "border-red-500",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" /> {date ? format(date, "PPP") : "Select a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={date}
                onSelect={handleDateChange}
                initialFocus
                disabled={(date) => {
                  // Disable dates in the past (before today)
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  return isBefore(date, today)
                }}
              />
            </PopoverContent>
          </Popover>
          {dateError && <p className="text-sm text-red-500">{dateError}</p>}
        </div>
      )}

      {mode === "workingday" && isDateHolidayResult === false && !isCheckingDate && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            The selected date is not a holiday. Working days can only be added for dates that are normally holidays.
          </AlertDescription>
        </Alert>
      )}

      {mode === "holiday" && formData.holiday_type === "day_of_week" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="day_of_week">Select Day of Week</Label>
            <Select
              value={formData.day_of_week?.toString()}
              onValueChange={(value) => setFormData({ ...formData, day_of_week: Number.parseInt(value) })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select day of week" />
              </SelectTrigger>
              <SelectContent>
                {dayOfWeekOptions.map((day) => (
                  <SelectItem key={day.value} value={day.value.toString()}>
                    {day.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Start From Date</Label>
            <div className="text-sm border p-1 rounded-md h-8 flex items-center text-xs bg-gray-50">
              {startFromDate ? format(startFromDate, "MMM d, yyyy") : "Today"}
            </div>
            <p className="text-xs text-gray-500 mt-1">The weekly holiday will be effective from today onwards</p>
          </div>
        </>
      )}

      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            isSubmitting ||
            (mode === "workingday" && isDateHolidayResult === false) ||
            !!dateError ||
            !!startFromDateError
          }
        >
          {isSubmitting ? "Saving..." : `Add ${mode === "holiday" ? "Holiday" : "Working Day"}`}
        </Button>
      </div>
    </form>
  )
}
