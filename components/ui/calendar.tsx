"use client"

import * as React from "react"
import DatePicker from "react-datepicker"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { format } from "date-fns"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

// Import the react-datepicker CSS
import "react-datepicker/dist/react-datepicker.css"

export interface CalendarProps {
  selected?: Date
  onSelect?: (date: Date | null) => void
  disabled?: boolean
  minDate?: Date
  maxDate?: Date
  className?: string
  showOutsideDays?: boolean
  [key: string]: any
}

const Calendar = React.forwardRef<HTMLDivElement, CalendarProps>(
  ({ selected, onSelect, disabled, minDate, maxDate, className, showOutsideDays = true, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("p-3 relative z-50", className)}>
        <DatePicker
          selected={selected}
          onChange={onSelect}
          disabled={disabled}
          minDate={minDate}
          maxDate={maxDate}
          inline
          showMonthDropdown
          showYearDropdown
          dropdownMode="select"
          calendarClassName="bg-background border-none"
          dayClassName={(date) =>
            cn(
              "rounded-md h-9 w-9 p-0 font-normal text-center flex items-center justify-center",
              date.getDate() === selected?.getDate() &&
                date.getMonth() === selected?.getMonth() &&
                date.getFullYear() === selected?.getFullYear()
                ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                : "hover:bg-accent hover:text-accent-foreground",
            )
          }
          renderCustomHeader={({
            date,
            decreaseMonth,
            increaseMonth,
            prevMonthButtonDisabled,
            nextMonthButtonDisabled,
          }) => (
            <div className="flex justify-between items-center px-2 py-2">
              <button
                onClick={decreaseMonth}
                disabled={prevMonthButtonDisabled}
                type="button"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 disabled:opacity-30",
                )}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-sm font-medium">{format(date, "MMMM yyyy")}</div>
              <button
                onClick={increaseMonth}
                disabled={nextMonthButtonDisabled}
                type="button"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 disabled:opacity-30",
                )}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          {...props}
        />
      </div>
    )
  },
)

Calendar.displayName = "Calendar"

export { Calendar }
