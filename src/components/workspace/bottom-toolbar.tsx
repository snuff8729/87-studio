import { memo } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlayIcon } from '@hugeicons/core-free-icons'
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
  // Download
  downloadButton?: ReactNode
  // Generation progress
  generationProgress: ReactNode
}

export const BottomToolbar = memo(function BottomToolbar({
  countPerScene,
  onCountChange,
  onGenerate,
  generating,
  totalImages,
  parameterPopover,
  scenePackDialog,
  downloadButton,
  generationProgress,
}: BottomToolbarProps) {
  const { t } = useTranslation()

  return (
    <div className="border-t border-border bg-background shrink-0 grid px-3 pb-2 lg:pb-0 gap-x-2 grid-cols-[auto_1fr] grid-rows-[2.25rem_2.75rem] lg:grid-cols-[auto_1fr_auto] lg:grid-rows-[3rem]">
      {/* Row 1 left / Desktop left — configuration actions */}
      <div className="flex items-center gap-1">
        {parameterPopover}
        {scenePackDialog}
        {downloadButton}
      </div>

      {/* Row 1 right / Desktop center — generation progress */}
      <div className="flex items-center justify-end lg:justify-center min-w-0">
        {generationProgress}
      </div>

      {/* Row 2 / Desktop right — generation controls */}
      <div className="flex items-center justify-center lg:justify-end gap-1.5 col-span-2 lg:col-span-1">
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
      </div>
    </div>
  )
})
