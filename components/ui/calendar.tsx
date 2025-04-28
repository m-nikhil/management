"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  // Add error boundary to catch and log any rendering errors
  const [hasError, setHasError] = React.useState(false)

  React.useEffect(() => {
    // Reset error state on props change
    setHasError(false)
  }, [props])

  // If we've encountered an error, render a simplified fallback
  if (hasError) {
    return (
      <div className="p-3 border rounded-md">
        <p className="text-sm text-center text-muted-foreground">Calendar unavailable. Please refresh the page.</p>
      </div>
    )
  }

  try {
    return (
      <DayPicker
        showOutsideDays={showOutsideDays}
        className={cn("p-3", className)}
        classNames={{
          months: "flex flex-col space-y-4",
          month: "space-y-4",
          caption: "flex justify-between pt-1 relative items-center",
          caption_label: "text-sm font-medium",
          nav: "space-x-1 flex items-center",
          nav_button: cn(
            buttonVariants({ variant: "outline" }),
            "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
          ),
          nav_button_previous: "mr-auto",
          nav_button_next: "ml-auto",
          table: "w-full border-collapse space-y-1",
          head_row: "flex",
          head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem] text-center",
          row: "flex w-full mt-2",
          cell: "text-center text-sm p-0 relative h-9 w-9",
          day: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal"),
          day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
          day_today: "bg-accent text-accent-foreground",
          day_outside: "text-muted-foreground opacity-50",
          day_disabled: "text-muted-foreground opacity-50",
          day_hidden: "invisible",
          ...classNames,
        }}
        components={{
          IconLeft: () => <ChevronLeft className="h-4 w-4" />,
          IconRight: () => <ChevronRight className="h-4 w-4" />,
        }}
        formatters={{
          formatWeekdayName: (date) => {
            try {
              // Defensive programming to handle potential date issues
              if (!(date instanceof Date) || isNaN(date.getTime())) {
                return ""
              }
              return date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 3)
            } catch (error) {
              console.error("Error formatting weekday name:", error)
              return ""
            }
          },
        }}
        {...props}
      />
    )
  } catch (error) {
    console.error("Error rendering calendar:", error)
    setHasError(true)
    return (
      <div className="p-3 border rounded-md">
        <p className="text-sm text-center text-muted-foreground">Calendar unavailable. Please refresh the page.</p>
      </div>
    )
  }
}

Calendar.displayName = "Calendar"

export { Calendar }
