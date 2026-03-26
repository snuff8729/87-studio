import type { GridSize } from '@/lib/use-image-grid-size'
import { useTranslation } from '@/lib/i18n'

const sizes: Array<GridSize> = ['sm', 'md', 'lg']

interface GridSizeToggleProps {
  value: GridSize
  onChange: (size: GridSize) => void
}

export function GridSizeToggle({ value, onChange }: GridSizeToggleProps) {
  const { t } = useTranslation()
  const labels: Record<GridSize, string> = {
    sm: t('common.gridSize.small'),
    md: t('common.gridSize.medium'),
    lg: t('common.gridSize.large'),
  }

  return (
    <div className="inline-flex items-center rounded-md border border-border bg-muted/50 p-0.5 gap-0.5">
      {sizes.map((size) => (
        <button
          key={size}
          onClick={() => onChange(size)}
          className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
            value === size
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title={labels[size]}
        >
          {labels[size]}
        </button>
      ))}
    </div>
  )
}
