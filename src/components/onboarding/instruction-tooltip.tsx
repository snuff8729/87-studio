import { useMemo } from 'react'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import type { OnboardingStepDef } from '@/lib/onboarding/types'

type Placement = 'bottom' | 'top' | 'right' | 'left'

const TOOLTIP_WIDTH = 368
const TOOLTIP_GAP = 16
const VIEWPORT_PADDING = 16

function calculatePlacement(
  targetRect: DOMRect
): { placement: Placement; top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Estimate tooltip height (varies, but ~200px is reasonable)
  const estimatedHeight = 200

  const spaceBelow = vh - targetRect.bottom
  const spaceAbove = targetRect.top
  const spaceRight = vw - targetRect.right
  const spaceLeft = targetRect.left

  // Prefer: bottom > top > right > left
  if (spaceBelow >= estimatedHeight + TOOLTIP_GAP) {
    return {
      placement: 'bottom',
      top: targetRect.bottom + TOOLTIP_GAP,
      left: clampHorizontal(
        targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2,
        vw
      ),
    }
  }
  if (spaceAbove >= estimatedHeight + TOOLTIP_GAP) {
    return {
      placement: 'top',
      top: targetRect.top - TOOLTIP_GAP - estimatedHeight,
      left: clampHorizontal(
        targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2,
        vw
      ),
    }
  }
  if (spaceRight >= TOOLTIP_WIDTH + TOOLTIP_GAP) {
    return {
      placement: 'right',
      top: clampVertical(
        targetRect.top + targetRect.height / 2 - estimatedHeight / 2,
        vh,
        estimatedHeight
      ),
      left: targetRect.right + TOOLTIP_GAP,
    }
  }
  if (spaceLeft >= TOOLTIP_WIDTH + TOOLTIP_GAP) {
    return {
      placement: 'left',
      top: clampVertical(
        targetRect.top + targetRect.height / 2 - estimatedHeight / 2,
        vh,
        estimatedHeight
      ),
      left: targetRect.left - TOOLTIP_GAP - TOOLTIP_WIDTH,
    }
  }

  // Fallback: bottom with clamping
  return {
    placement: 'bottom',
    top: Math.min(targetRect.bottom + TOOLTIP_GAP, vh - estimatedHeight - VIEWPORT_PADDING),
    left: clampHorizontal(
      targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2,
      vw
    ),
  }
}

function clampHorizontal(left: number, vw: number): number {
  return Math.max(
    VIEWPORT_PADDING,
    Math.min(left, vw - TOOLTIP_WIDTH - VIEWPORT_PADDING)
  )
}

function clampVertical(
  top: number,
  vh: number,
  height: number
): number {
  return Math.max(
    VIEWPORT_PADDING,
    Math.min(top, vh - height - VIEWPORT_PADDING)
  )
}

interface InstructionTooltipProps {
  targetRect: DOMRect | null
  stepDef: OnboardingStepDef
  currentStep: number
  totalSteps: number
  conditionMet: boolean
  onNext: () => void
  onSkipStep: () => void
  onSkip: () => void
}

export function InstructionTooltip({
  targetRect,
  stepDef,
  currentStep,
  totalSteps,
  conditionMet,
  onNext,
  onSkipStep,
  onSkip,
}: InstructionTooltipProps) {
  const { t } = useTranslation()

  const position = useMemo(() => {
    if (!targetRect) {
      // Center on screen
      return {
        placement: 'bottom' as Placement,
        top: window.innerHeight / 2 - 100,
        left: Math.max(
          VIEWPORT_PADDING,
          window.innerWidth / 2 - TOOLTIP_WIDTH / 2
        ),
      }
    }
    return calculatePlacement(targetRect)
  }, [targetRect])

  const arrowStyle = useMemo(() => {
    if (!targetRect) return null

    const arrowSize = 8

    switch (position.placement) {
      case 'bottom':
        return {
          top: -arrowSize,
          left: Math.min(
            Math.max(
              targetRect.left + targetRect.width / 2 - position.left - arrowSize,
              16
            ),
            TOOLTIP_WIDTH - 32
          ),
          borderLeft: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid var(--card)`,
        } as const
      case 'top':
        return {
          bottom: -arrowSize,
          left: Math.min(
            Math.max(
              targetRect.left + targetRect.width / 2 - position.left - arrowSize,
              16
            ),
            TOOLTIP_WIDTH - 32
          ),
          borderLeft: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid transparent`,
          borderTop: `${arrowSize}px solid var(--card)`,
        } as const
      case 'right':
        return {
          left: -arrowSize,
          top: Math.max(16, targetRect.top + targetRect.height / 2 - position.top - arrowSize),
          borderTop: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid var(--card)`,
        } as const
      case 'left':
        return {
          right: -arrowSize,
          top: Math.max(16, targetRect.top + targetRect.height / 2 - position.top - arrowSize),
          borderTop: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid transparent`,
          borderLeft: `${arrowSize}px solid var(--card)`,
        } as const
      default:
        return null
    }
  }, [targetRect, position])

  const translateOrigin = {
    bottom: 'translateY(8px)',
    top: 'translateY(-8px)',
    right: 'translateX(8px)',
    left: 'translateX(-8px)',
  }[position.placement]

  return (
    <div
      className="fixed z-[9999] w-full max-w-sm rounded-xl border border-primary/50 bg-card p-4 shadow-2xl shadow-primary/10"
      style={{
        top: position.top,
        left: position.left,
        maxWidth: TOOLTIP_WIDTH,
        animation: 'onboarding-tooltip-in 0.2s ease-out forwards',
      }}
    >
      <style>{`
        @keyframes onboarding-tooltip-in {
          from {
            opacity: 0;
            transform: ${translateOrigin};
          }
          to {
            opacity: 1;
            transform: translate(0);
          }
        }
      `}</style>

      {/* Arrow */}
      {arrowStyle && (
        <div
          className="absolute h-0 w-0"
          style={{ ...arrowStyle, position: 'absolute' }}
        />
      )}

      {/* Step indicator */}
      <div className="mb-2 text-xs font-medium text-muted-foreground">
        {t('onboarding.stepOf', {
          current: String(currentStep),
          total: String(totalSteps),
        })}
      </div>

      {/* Title */}
      <h3 className="mb-1 text-sm font-semibold text-foreground">
        {t(stepDef.titleKey as any)}
      </h3>

      {/* Description */}
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        {t(stepDef.descriptionKey as any)}
      </p>

      {/* Buttons */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="xs" onClick={onSkip}>
          {t('onboarding.skipTutorial')}
        </Button>

        <div className="flex items-center gap-2">
          {stepDef.showSkipButton && (
            <Button variant="outline" size="xs" onClick={onSkipStep}>
              {t('onboarding.later')}
            </Button>
          )}
          {stepDef.showNextButton && (
            <Button
              size="xs"
              onClick={onNext}
              disabled={!conditionMet}
            >
              {t('onboarding.next')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
