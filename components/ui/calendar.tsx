"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"

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
    <div className="calendar-wrapper p-3 bg-white rounded-md shadow-md">
      <style jsx global>{`
        /* Force grid layout for calendar */
        .rdp-months {
          display: flex !important;
          justify-content: center !important;
        }
        .rdp-month {
          margin: 0 !important;
        }
        .rdp-table {
          margin: 0 !important;
          border-collapse: collapse !important;
        }
        .rdp-head_row,
        .rdp-row {
          display: grid !important;
          grid-template-columns: repeat(7, 1fr) !important;
          margin: 8px 0 !important;
        }
        .rdp-head_cell,
        .rdp-cell {
          width: 40px !important;
          height: 36px !important;
          text-align: center !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        .rdp-head_cell {
          font-weight: 500 !important;
          font-size: 0.8rem !important;
        }
        .rdp-button {
          width: 36px !important;
          height: 36px !important;
          font-size: 0.875rem !important;
          border-radius: 9999px !important;
          margin: 0 auto !important;
          padding: 0 !important;
          background: none !important;
          color: inherit !important;
          font-family: inherit !important;
          line-height: inherit !important;
          cursor: pointer !important;
        }
        .rdp-button:hover:not([disabled]) {
          background-color: #f3f4f6 !important;
        }
        .rdp-day_selected {
          background-color: #2563eb !important;
          color: white !important;
        }
        .rdp-day_selected:hover {
          background-color: #1d4ed8 !important;
        }
        .rdp-day_today {
          font-weight: bold !important;
        }
        .rdp-nav {
          display: flex !important;
          align-items: center !important;
        }
        .rdp-caption {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          padding: 0 0 8px 0 !important;
        }
        .rdp-caption_label {
          font-weight: 600 !important;
          font-size: 1rem !important;
        }
      `}</style>
      <DayPicker
        showOutsideDays={showOutsideDays}
        className={cn("", className)}
        classNames={{
          ...classNames,
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
    </div>
  )
}

Calendar.displayName = "Calendar"

export { Calendar }
