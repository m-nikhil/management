"use client"
import { AlertCircle } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface HolidayWarningDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  warnings: string[]
}

export function HolidayWarningDialog({ isOpen, onClose, onConfirm, warnings }: HolidayWarningDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center text-amber-600">
            <AlertCircle className="h-5 w-5 mr-2" />
            Holiday Warning
          </AlertDialogTitle>
        </AlertDialogHeader>

        <div className="mt-2 text-sm text-gray-700">
          <div className="mb-2">This task has dates that fall on holidays:</div>
          <ul className="list-disc pl-5 space-y-1 text-amber-700">
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
          <div className="mt-4">Do you want to save anyway?</div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-amber-600 hover:bg-amber-700">
            Save Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
