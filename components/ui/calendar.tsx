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
        IconLeft: () => <ChevronLeft className="h-4 w-4 text-blue-500" />,
        IconRight: () => <ChevronRight className="h-4 w-4 text-blue-500" />,
      }}
      formatters={{
        formatWeekdayName: safeFormatWeekday,
      }}
      styles={{
        months: { display: "flex" },
        month: { margin: 0 },
        caption: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0 8px 0" },
        caption_label: { fontWeight: 600, fontSize: "1rem" },
        nav: { display: "flex", alignItems: "center" },
        nav_button: {
          width: "28px",
          height: "28px",
          padding: 0,
          background: "transparent",
          border: "none",
          color: "#3b82f6",
          cursor: "pointer",
        },
        table: { margin: 0, borderCollapse: "collapse" },
        head_row: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", margin: "8px 0" },
        row: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", margin: "8px 0" },
        head_cell: {
          width: "40px",
          height: "36px",
          textAlign: "center",
          padding: 0,
          margin: 0,
          fontWeight: 500,
          fontSize: "0.8rem",
          color: "hsl(var(--muted-foreground))",
        },
        cell: { width: "40px", height: "36px", textAlign: "center", padding: 0, margin: 0 },
        button: {
          width: "36px",
          height: "36px",
          fontSize: "0.875rem",
          borderRadius: "50%",
          margin: "0 auto",
          padding: 0,
          background: "none",
          color: "inherit",
          fontFamily: "inherit",
          lineHeight: "inherit",
          cursor: "pointer",
        },
        day_selected: { backgroundColor: "#3b82f6", color: "white" },
        day_today: { color: "#3b82f6", fontWeight: "bold" },
        day_outside: { opacity: 0.5 },
        day_disabled: { opacity: 0.5, cursor: "not-allowed" },
      }}
      {...props}
    />
  )
}

Calendar.displayName = "Calendar"

export { Calendar }
