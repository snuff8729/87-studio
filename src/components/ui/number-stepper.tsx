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

  function decrement() {
    const current = value ?? Number(placeholder) ?? min
    const next = Math.max(min, current - step)
    onChange(next)
  }

  function increment() {
    const current = value ?? Number(placeholder) ?? min
    const next = Math.min(max, current + step)
    onChange(next)
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
          h, btnW, textSize,
        )}
      >
        &minus;
      </button>
      <span
        className={cn(
          'min-w-[28px] text-center tabular-nums select-none px-0.5',
          textSize,
          isDefault ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {display}
      </span>
      <button
        type="button"
        onClick={increment}
        className={cn(
          'flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors',
          h, btnW, textSize,
        )}
      >
        +
      </button>
    </div>
  )
}
