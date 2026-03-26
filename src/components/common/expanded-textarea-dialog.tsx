import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface ExpandedTextareaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onBlur?: () => void
}

export function ExpandedTextareaDialog({
  open,
  onOpenChange,
  title,
  value,
  onChange,
  placeholder,
  onBlur,
}: ExpandedTextareaDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && onBlur) onBlur()
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="flex flex-col max-w-[calc(100%-2rem)] w-[90vw] h-[85vh] sm:max-w-[90vw] max-sm:inset-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:top-0 max-sm:left-0 max-sm:w-full max-sm:h-full max-sm:max-w-full max-sm:rounded-none">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-h-0 text-base font-mono resize-none"
          autoFocus
        />
      </DialogContent>
    </Dialog>
  )
}
