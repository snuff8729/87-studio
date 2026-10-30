import { cn } from '@/lib/utils'

/** Compact single-choice segmented control (radio group semantics) */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex h-8 max-w-full items-center rounded-lg bg-secondary/60 p-0.5',
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          data-segment={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 flex-1 whitespace-nowrap rounded-md px-2.5 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            o.value === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
