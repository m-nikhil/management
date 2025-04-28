"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  // Force client-side rendering only
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // If not mounted yet, return a placeholder with the same dimensions
  if (!mounted) {
    return <div className="p-3 min-h-[300px] flex items-center justify-center">Loading...</div>
  }

  return (
    <div className={cn("p-3 calendar-wrapper", className)}>
      <style jsx global>{`
        /* Ensure these styles are applied globally and not stripped out during build */
        .rdp {
          margin: 0;
        }
        .rdp-months {
          display: flex;
          flex-direction: column;
        }
        .rdp-month {
          margin: 0;
          padding: 0;
        }
        .rdp-caption {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 0.25rem;
          padding-bottom: 0.25rem;
        }
        .rdp-caption_label {
          font-size: 0.875rem;
          font-weight: 500;
        }
        .rdp-nav {
          display: flex;
          align-items: center;
        }
        .rdp-head {
          margin-top: 0.5rem;
        }
        .rdp-head_row {
          display: flex;
          width: 100%;
        }
        .rdp-head_cell {
          width: 2.25rem;
          height: 2.25rem;
          font-size: 0.75rem;
          font-weight: normal;
          text-align: center;
          color: var(--muted-foreground, #6b7280);
        }
        .rdp-tbody {
          margin-top: 0.5rem;
        }
        .rdp-row {
          display: flex;
          width: 100%;
          margin-top: 0.5rem;
        }
        .rdp-cell {
          width: 2.25rem;
          height: 2.25rem;
          text-align: center;
          position: relative;
        }
        .rdp-day {
          width: 2.25rem;
          height: 2.25rem;
          padding: 0;
          border-radius: 0.25rem;
          font-size: 0.875rem;
          line-height: 2.25rem;
          cursor: pointer;
          border: none;
          background: transparent;
        }
        .rdp-day:hover:not(.rdp-day_selected):not(.rdp-day_disabled) {
          background-color: var(--accent, #f3f4f6);
        }
        .rdp-day_selected {
          background-color: var(--primary, #3b82f6);
          color: white;
        }
        .rdp-day_today {
          background-color: var(--accent, #f3f4f6);
          font-weight: bold;
        }
        .rdp-day_outside {
          opacity: 0.5;
        }
        .rdp-day_disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .rdp-button {
          border: none;
          background: transparent;
          cursor: pointer;
          padding: 0;
          margin: 0;
        }
        .rdp-nav_button {
          width: 1.75rem;
          height: 1.75rem;
          border-radius: 0.25rem;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.5;
        }
        .rdp-nav_button:hover {
          opacity: 1;
          background-color: var(--accent, #f3f4f6);
        }
      `}</style>

      <DayPicker
        showOutsideDays={showOutsideDays}
        className="rdp"
        classNames={{
          months: "rdp-months",
          month: "rdp-month",
          caption: "rdp-caption",
          caption_label: "rdp-caption_label",
          nav: "rdp-nav",
          nav_button: "rdp-button rdp-nav_button",
          nav_button_previous: "rdp-nav_button_previous",
          nav_button_next: "rdp-nav_button_next",
          table: "rdp-table",
          head: "rdp-head",
          head_row: "rdp-head_row",
          head_cell: "rdp-head_cell",
          tbody: "rdp-tbody",
          row: "rdp-row",
          cell: "rdp-cell",
          day: "rdp-day rdp-button",
          day_selected: "rdp-day_selected",
          day_today: "rdp-day_today",
          day_outside: "rdp-day_outside",
          day_disabled: "rdp-day_disabled",
          day_hidden: "rdp-day_hidden",
        }}
        components={{
          IconLeft: () => <ChevronLeft className="h-4 w-4" />,
          IconRight: () => <ChevronRight className="h-4 w-4" />,
        }}
        formatters={{
          formatWeekdayName: (date) => {
            const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
            try {
              return days[date.getDay()]
            } catch (e) {
              console.error("Error formatting weekday:", e)
              return ""
            }
          },
        }}
        {...props}
      />
    </div>
  )
}

Calendar.displayName = "Calendar"

export { Calendar }
