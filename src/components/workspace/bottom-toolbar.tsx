import { memo } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  PlayIcon,
  Menu01Icon,
  TimeQuarter02Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { NumberStepper } from '@/components/ui/number-stepper'
import { useTranslation } from '@/lib/i18n'
import type { ReactNode } from 'react'

interface BottomToolbarProps {
  // Generation
  countPerScene: number
  onCountChange: (count: number) => void
  onGenerate: () => void
  generating: boolean
  totalImages: number
  // Popovers
  parameterPopover: ReactNode
  scenePackDialog: ReactNode
  // Generation progress
  generationProgress: ReactNode
  // Mobile toggles
  onToggleLeft: () => void
  onToggleRight: () => void
}

export const BottomToolbar = memo(function BottomToolbar({
  countPerScene,
  onCountChange,
  onGenerate,
  generating,
  totalImages,
  parameterPopover,
  scenePackDialog,
  generationProgress,
  onToggleLeft,
  onToggleRight,
}: BottomToolbarProps) {
  const { t } = useTranslation()

  return (
    <div className="h-12 border-t border-border bg-background flex items-center justify-between px-3 gap-2 shrink-0">
      {/* Left — mobile toggles + popovers */}
      <div className="flex items-center gap-1">
        {/* Mobile panel toggles */}
        <Button variant="ghost" size="sm" onClick={onToggleLeft} className="lg:hidden">
          <HugeiconsIcon icon={Menu01Icon} className="size-5" />
        </Button>

        {parameterPopover}
        {scenePackDialog}
      </div>

      {/* Center — generation progress */}
      <div className="flex-1 min-w-0 flex justify-center">
        {generationProgress}
      </div>

      {/* Right — generation controls + mobile toggle */}
      <div className="flex items-center gap-1.5">
        <NumberStepper
          value={countPerScene}
          onChange={(v) => onCountChange(Math.max(0, v ?? 0))}
          min={0}
          max={100}
          size="md"
        />
        <Button
          size="sm"
          onClick={onGenerate}
          disabled={generating || totalImages === 0}
        >
          <HugeiconsIcon icon={PlayIcon} className="size-5" />
          <span className="hidden sm:inline">
            {generating ? t('generation.generating') : totalImages > 0 ? t('generation.generateCount', { count: totalImages }) : t('generation.generate')}
          </span>
        </Button>

        <Button variant="ghost" size="sm" onClick={onToggleRight} className="lg:hidden">
          <HugeiconsIcon icon={TimeQuarter02Icon} className="size-5" />
        </Button>
      </div>
    </div>
  )
})
