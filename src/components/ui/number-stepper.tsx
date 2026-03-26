import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface NumberStepperProps {
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  placeholder?: string
  size?: 'sm' | 'md'
  className?: string
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  placeholder,
  size = 'sm',
  className,
}: NumberStepperProps) {
  const display = value ?? placeholder ?? '0'
  const isDefault = value === null
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function decrement() {
    const current = value !== null ? value : Number(placeholder || min)
    const next = Math.max(min, current - step)
    onChange(next)
  }

  function increment() {
    const current = value !== null ? value : Number(placeholder || min)
    const next = Math.min(max, current + step)
    onChange(next)
  }

  function commitEdit() {
    setEditing(false)
    const trimmed = editValue.trim()
    if (trimmed === '') {
      onChange(min)
      return
    }
    const parsed = parseInt(trimmed, 10)
    if (isNaN(parsed)) return
    onChange(Math.min(max, Math.max(min, parsed)))
  }

  const h = size === 'sm' ? 'h-8' : 'h-9'
  const textSize = size === 'sm' ? 'text-sm' : 'text-base'
  const btnW = size === 'sm' ? 'w-7' : 'w-8'

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border border-border bg-input/30 overflow-hidden',
        h,
        className,
      )}
    >
      <button
        type="button"
        onClick={decrement}
        className={cn(
          'flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors',
          h,
          btnW,
          textSize,
        )}
      >
        &minus;
      </button>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        readOnly={!editing}
        value={editing ? editValue : String(display)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, '')
          setEditValue(raw)
          const parsed = parseInt(raw, 10)
          if (!isNaN(parsed)) onChange(Math.min(max, Math.max(min, parsed)))
          else if (raw === '') onChange(min)
        }}
        onFocus={() => {
          setEditValue(String(value ?? ''))
          setEditing(true)
          requestAnimationFrame(() => inputRef.current?.select())
        }}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') inputRef.current?.blur()
          if (e.key === 'Escape') {
            setEditing(false)
            inputRef.current?.blur()
          }
        }}
        className={cn(
          'min-w-[28px] w-[36px] text-center tabular-nums bg-transparent outline-none border-none p-0 cursor-text',
          textSize,
          !editing && isDefault ? 'text-muted-foreground' : 'text-foreground',
        )}
      />
      <button
        type="button"
        onClick={increment}
        className={cn(
          'flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors',
          h,
          btnW,
          textSize,
        )}
      >
        +
      </button>
    </div>
  )
}
