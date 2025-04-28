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
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
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
    <div className="rdp-root-override">
      <style jsx global>{`
        /* Base calendar styles */
        .rdp-root-override .rdp {
          margin: 0;
        }
        
        /* Month styles */
        .rdp-root-override .rdp-months {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        
        /* Caption styles */
        .rdp-root-override .rdp-caption {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 0.25rem;
          position: relative;
        }
        
        .rdp-root-override .rdp-caption_label {
          font-size: 0.875rem;
          font-weight: 500;
        }
        
        /* Navigation styles */
        .rdp-root-override .rdp-nav {
          display: flex;
          gap: 0.25rem;
        }
        
        /* Table styles */
        .rdp-root-override .rdp-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 0.25rem;
        }
        
        /* Head row styles */
        .rdp-root-override .rdp-head_row {
          display: flex;
        }
        
        /* Head cell styles */
        .rdp-root-override .rdp-head_cell {
          color: var(--muted-foreground, #6b7280);
          font-size: 0.75rem;
          font-weight: 400;
          text-align: center;
          width: 2.25rem;
          padding: 0.25rem 0;
        }
        
        /* Row styles */
        .rdp-root-override .rdp-row {
          display: flex;
          width: 100%;
          margin-top: 0.5rem;
        }
        
        /* Cell styles */
        .rdp-root-override .rdp-cell {
          text-align: center;
          padding: 0;
          position: relative;
          width: 2.25rem;
          height: 2.25rem;
        }
        
        /* Day styles */
        .rdp-root-override .rdp-day {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2.25rem;
          height: 2.25rem;
          font-size: 0.875rem;
          border-radius: 0.375rem;
          cursor: pointer;
          border: none;
          background: transparent;
        }
        
        .rdp-root-override .rdp-day:hover:not([disabled]) {
          background-color: var(--accent, #f3f4f6);
          color: var(--accent-foreground, #111827);
        }
        
        .rdp-root-override .rdp-day_selected {
          background-color: var(--primary, #2563eb);
          color: var(--primary-foreground, #ffffff);
        }
        
        .rdp-root-override .rdp-day_today {
          background-color: var(--accent, #f3f4f6);
          color: var(--accent-foreground, #111827);
        }
        
        .rdp-root-override .rdp-day_outside {
          opacity: 0.5;
        }
        
        .rdp-root-override .rdp-day_disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .rdp-root-override .rdp-button {
          border-radius: 0.375rem;
          height: 2.25rem;
          width: 2.25rem;
          padding: 0;
          background: transparent;
          opacity: 0.5;
        }
        
        .rdp-root-override .rdp-button:hover {
          opacity: 1;
          background-color: var(--accent, #f3f4f6);
        }
      `}</style>
      <DayPicker
        showOutsideDays={showOutsideDays}
        className={cn("p-3 bg-white rounded-md shadow-md", className)}
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
