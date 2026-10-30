import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n'

/** Name input + Create button (used inside the ＋ New popover). */
export function NameForm({
  placeholder,
  initial = '',
  actionLabel,
  onSubmit,
}: {
  placeholder: string
  initial?: string
  actionLabel?: string
  onSubmit: (name: string) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const trimmed = name.trim()

  async function submit() {
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await onSubmit(trimmed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 text-sm"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void submit()
          }
        }}
      />
      <div className="flex justify-end">
        <Button size="sm" disabled={!trimmed || busy} onClick={submit}>
          {actionLabel ?? t('common.create')}
        </Button>
      </div>
    </div>
  )
}
