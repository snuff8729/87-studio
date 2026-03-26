import { Suspense, lazy } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

const PromptEditor = lazy(() =>
  import('@/components/prompt-editor/prompt-editor').then((m) => ({
    default: m.PromptEditor,
  })),
)

interface ExpandedEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  value: string
  onChange: (value: string) => void
  bundleNames?: Array<{ name: string; content: string }>
}

export function ExpandedEditorDialog({
  open,
  onOpenChange,
  title,
  value,
  onChange,
  bundleNames,
}: ExpandedEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col max-w-[calc(100%-2rem)] w-[90vw] h-[85vh] sm:max-w-[90vw] max-sm:inset-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:top-0 max-sm:left-0 max-sm:w-full max-sm:h-full max-sm:max-w-full max-sm:rounded-none">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden [&_.cm-editor]:!h-full [&_.cm-scroller]:!h-full [&_.cm-content]:!min-h-full">
          <Suspense
            fallback={
              <Textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="font-mono text-base h-full resize-none"
              />
            }
          >
            <PromptEditor
              value={value}
              onChange={onChange}
              minHeight="100%"
              bundleNames={bundleNames}
            />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  )
}
