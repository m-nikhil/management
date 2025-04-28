"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"

// Import the react-day-picker styles
import "react-day-picker/dist/style.css"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  // Use useEffect to ensure the component is fully mounted before rendering complex UI
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  // If not mounted yet, show a simple loading state
  if (!isMounted) {
    return <div className="p-3 h-[350px] flex items-center justify-center">Loading calendar...</div>
  }

  // Simple formatter function that doesn't rely on complex date operations
  const safeFormatWeekday = (date: Date) => {
    const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
    try {
      if (date instanceof Date && !isNaN(date.getTime())) {
        return days[date.getDay()]
      }
      return ""
    } catch (e) {
      console.error("Error formatting weekday:", e)
      return ""
    }
  }

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 bg-card text-card-foreground rounded-md shadow-sm border border-border", className)}
      classNames={{
        ...classNames,
        day_selected: "rdp-day_selected",
        day_today: "rdp-day_today",
        day_outside: "rdp-day_outside",
        day_disabled: "rdp-day_disabled",
        day: "rdp-day",
        button: "rdp-button",
        nav_button: "rdp-nav_button",
        caption: "rdp-caption",
        caption_label: "rdp-caption_label",
        head_cell: "rdp-head_cell",
        cell: "rdp-cell",
        table: "rdp-table",
        month: "rdp-month",
        months: "rdp-months",
        nav: "rdp-nav",
        head_row: "rdp-head_row",
        row: "rdp-row",
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
      }}
      formatters={{
        formatWeekdayName: safeFormatWeekday,
      }}
      {...props}
    />
  )
}

Calendar.displayName = "Calendar"

export { Calendar }
