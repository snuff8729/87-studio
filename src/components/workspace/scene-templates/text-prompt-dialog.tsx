import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTranslation } from '@/lib/i18n'

/** Small controlled dialog for one text value (rename, edit description). */
export function TextPromptDialog({
  open,
  onOpenChange,
  title,
  initial,
  multiline,
  allowEmpty,
  error,
  submitLabel,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initial: string
  multiline?: boolean
  allowEmpty?: boolean
  /** Validation message shown for the current text (also blocks submit) */
  error?: (value: string) => string | null
  submitLabel?: string
  onSubmit: (value: string) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setValue(initial)
  }, [open, initial])

  const trimmed = value.trim()
  const message = trimmed ? (error?.(trimmed) ?? null) : null
  const canSubmit = (allowEmpty || trimmed.length > 0) && !message && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      await onSubmit(trimmed)
      onOpenChange(false)
    } catch {
      // The caller reports the failure; keep the dialog open
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-block-shortcuts>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          {multiline ? (
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={3}
              autoFocus
              aria-label={title}
            />
          ) : (
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void submit()
                }
              }}
              aria-label={title}
              aria-invalid={message ? true : undefined}
              autoFocus
            />
          )}
          {message && (
            <p role="alert" className="text-xs text-destructive">
              {message}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {submitLabel ?? t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
