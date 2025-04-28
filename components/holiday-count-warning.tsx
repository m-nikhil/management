"use client"

import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

interface HolidayCountWarningProps {
  taskId: number
  onUpdate: () => void
}

export function HolidayCountWarning({ taskId, onUpdate }: HolidayCountWarningProps) {
  return (
    <Alert variant="warning" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Holiday Count May Be Outdated</AlertTitle>
      <AlertDescription className="flex justify-between items-center">
        <span>Holidays have been modified since this task was last updated. The holiday count may be incorrect.</span>
        <Button size="sm" onClick={onUpdate} className="ml-4">
          Recalculate
        </Button>
      </AlertDescription>
    </Alert>
  )
}
