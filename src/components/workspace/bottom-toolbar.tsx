import { memo, useState, useCallback, useRef } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlayIcon } from '@hugeicons/core-free-icons'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { NumberStepper } from '@/components/ui/number-stepper'
import { useTranslation } from '@/lib/i18n'

function GenerateButton({
  totalImages,
  onGenerate,
}: {
  totalImages: number
  onGenerate: () => void
}) {
  const { t } = useTranslation()
  const [cooldown, setCooldown] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClick = useCallback(() => {
    onGenerate()
    setCooldown(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCooldown(false), 1000)
  }, [onGenerate])

  return (
    <Button
      size="sm"
      onClick={handleClick}
      disabled={totalImages === 0 || cooldown}
    >
      <HugeiconsIcon icon={PlayIcon} className="size-5" />
      <span className="hidden sm:inline">
        {totalImages > 0
          ? t('generation.generateCount', { count: totalImages })
          : t('generation.generate')}
      </span>
    </Button>
  )
}

interface BottomToolbarProps {
  // Generation
  countPerScene: number
  onCountChange: (count: number) => void
  onGenerate: () => void
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
  totalImages,
  parameterPopover,
  scenePackDialog,
  downloadButton,
  generationProgress,
}: BottomToolbarProps) {
  return (
    <div className="border-t border-border bg-background shrink-0 grid px-3 pb-2 lg:pb-0 gap-x-2 grid-cols-[auto_1fr] grid-rows-[2.25rem_2.75rem] lg:grid-cols-[auto_1fr_auto] lg:grid-rows-[3rem]">
      {/* Row 1 left / Desktop left — configuration actions */}
      <div className="flex items-center gap-1">
        {parameterPopover}
        {scenePackDialog}
        {downloadButton}
      </div>

      {/* Row 1 right / Desktop center — generation progress */}
      <div className="flex items-center justify-end lg:justify-center min-w-0 overflow-hidden">
        {generationProgress}
      </div>

      {/* Row 2 / Desktop right — generation controls */}
      <div
        className="flex items-center justify-center lg:justify-end gap-1.5 col-span-2 lg:col-span-1"
        data-onboarding="generation-controls"
      >
        <NumberStepper
          value={countPerScene}
          onChange={(v) => onCountChange(Math.max(0, v ?? 0))}
          min={0}
          max={100}
          size="md"
        />
        <GenerateButton totalImages={totalImages} onGenerate={onGenerate} />
      </div>
    </div>
  )
})
