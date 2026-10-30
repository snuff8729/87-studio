import { useEffect, useState } from 'react'
import type { DanbooruTag } from '@/server/functions/danbooru'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { searchDanbooruTags } from '@/server/functions/danbooru'
import { useTranslation } from '@/lib/i18n'

/** Asks for a prompt tag (with Danbooru autocomplete) for the gallery filter. */
export function PromptTagDialog({
  open,
  onOpenChange,
  initial,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: string
  onApply: (tag: string) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initial ?? '')
  const [suggestions, setSuggestions] = useState<Array<DanbooruTag>>([])

  useEffect(() => {
    if (open) setValue(initial ?? '')
  }, [open, initial])

  useEffect(() => {
    const q = value.trim().replace(/\s+/g, '_')
    if (!open || q.length < 2) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      searchDanbooruTags({ data: { query: q, limit: 8 } })
        .then((r) => {
          if (!cancelled) setSuggestions(r)
        })
        .catch(() => {
          if (!cancelled) setSuggestions([])
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [value, open])

  function apply(raw: string) {
    const tag = raw.trim().replace(/\s+/g, '_')
    if (!tag) return
    onApply(tag)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-prompt-tag-dialog>
        <DialogHeader>
          <DialogTitle>{t('gallery.filterPromptTag')}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={value}
          placeholder={t('gallery.promptTagPlaceholder')}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              apply(value)
            }
          }}
          data-prompt-tag-input
        />
        {suggestions.length > 0 && (
          <ul className="max-h-56 overflow-y-auto rounded-md border border-border">
            {suggestions.map((s) => (
              <li key={s.name}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => apply(s.name)}
                >
                  <span className="truncate">{s.name.replace(/_/g, ' ')}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {s.postCount.toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => apply(value)} disabled={!value.trim()}>
            {t('gallery.applyFilter')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
