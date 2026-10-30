import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

/**
 * Text that turns into an input on click. Enter / blur saves, Esc cancels,
 * an empty or unchanged name is ignored.
 */
export function InlineName({
  value,
  onCommit,
  ariaLabel,
  className,
  inputClassName,
  placeholder,
}: {
  value: string
  onCommit: (name: string) => void
  ariaLabel: string
  className?: string
  inputClassName?: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const doneRef = useRef(false)

  function finish(save: boolean) {
    if (doneRef.current) return
    doneRef.current = true
    setEditing(false)
    const next = draft.trim()
    if (save && next && next !== value) onCommit(next)
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        data-inline-name-input=""
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            finish(true)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            finish(false)
          }
        }}
        className={cn('h-7 min-w-0 flex-1 px-2 text-sm', inputClassName)}
      />
    )
  }
  return (
    <button
      type="button"
      data-inline-name=""
      aria-label={ariaLabel}
      title={value}
      onClick={() => {
        doneRef.current = false
        setDraft(value)
        setEditing(true)
      }}
      className={cn(
        'min-w-0 flex-1 cursor-text truncate rounded-md px-2 py-1 text-left text-sm outline-none hover:bg-secondary/60 focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
    >
      {value}
    </button>
  )
}
