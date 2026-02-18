import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { useOnboardingMaybe } from '@/lib/onboarding'
import { useTranslation } from '@/lib/i18n'
import { ONBOARDING_STEPS, TOTAL_STEPS } from '@/lib/onboarding/steps'
import { WelcomeDialog } from './welcome-dialog'
import { CompletionDialog } from './completion-dialog'
import { SpotlightBackdrop } from './spotlight-backdrop'
import { InstructionTooltip } from './instruction-tooltip'

function checkCondition(check: string): boolean {
  if (check === 'prompt-has-placeholder') {
    const el = document.querySelector('[data-onboarding="prompt-editor"]')
    if (el) {
      const text = el.textContent || ''
      return /\\\\.+?\\\\/.test(text)
    }
  } else if (check === 'scene-exists') {
    const items = document.querySelectorAll('[data-onboarding="scene-item"]')
    return items.length > 0
  } else if (check === 'scene-selected-in-edit') {
    const editor = document.querySelector('[data-onboarding="placeholder-editor"]')
    return !!editor
  } else if (check === 'placeholder-filled') {
    const editor = document.querySelector('[data-onboarding="placeholder-editor"]')
    if (editor) {
      const textareas = editor.querySelectorAll('textarea')
      for (const ta of textareas) {
        if ((ta as HTMLTextAreaElement).value.trim()) return true
      }
    }
  }
  return false
}

function OnboardingActiveOverlay() {
  const ctx = useOnboardingMaybe()
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [conditionMet, setConditionMet] = useState(false)
  const targetElRef = useRef<Element | null>(null)

  const state = ctx?.state
  const step = state?.step ?? 0
  const active = state?.active ?? false
  const projectId = state?.projectId ?? null

  const stepDef = ONBOARDING_STEPS[step]
  const isStepInRange = active && step >= 1 && step <= TOTAL_STEPS

  useEffect(() => {
    if (!isStepInRange || !stepDef) {
      targetElRef.current = null
      setTargetRect(null)
      return
    }

    let selector = `[data-onboarding="${stepDef.target}"]`
    if (step === 3 && projectId) {
      selector = `[data-onboarding="project-card-${projectId}"]`
    }
    const activeSelector = stepDef.activeTarget
      ? `[data-onboarding="${stepDef.activeTarget}"]`
      : null

    let hasScrolled = false

    function findAndTrack() {
      // Prefer activeTarget (e.g., dialog/form opened by button click)
      const el = (activeSelector && document.querySelector(activeSelector))
        || document.querySelector(selector)
      if (el) {
        targetElRef.current = el
        setTargetRect(el.getBoundingClientRect())
        if (!hasScrolled) {
          hasScrolled = true
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      } else {
        targetElRef.current = null
        setTargetRect(null)
      }
    }

    findAndTrack()
    const pollInterval = setInterval(findAndTrack, 200)

    function updateRect() {
      if (targetElRef.current) {
        setTargetRect(targetElRef.current.getBoundingClientRect())
      }
    }

    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)

    const observer = new ResizeObserver(updateRect)
    if (targetElRef.current) observer.observe(targetElRef.current)

    return () => {
      clearInterval(pollInterval)
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
      observer.disconnect()
    }
  }, [step, isStepInRange, projectId, stepDef])

  // Observe target element changes for ResizeObserver
  useEffect(() => {
    if (!targetElRef.current) return
    const observer = new ResizeObserver(() => {
      if (targetElRef.current) {
        setTargetRect(targetElRef.current.getBoundingClientRect())
      }
    })
    observer.observe(targetElRef.current)
    return () => observer.disconnect()
  }, [targetRect])

  // Condition polling — local to overlay, doesn't re-render the main tree
  useEffect(() => {
    if (!isStepInRange || !stepDef) return
    if (stepDef.completion.type !== 'condition') {
      setConditionMet(false)
      return
    }

    const check = stepDef.completion.check

    function poll() {
      const met = checkCondition(check)

      // Auto-advance when condition met and no Next button
      if (met && !stepDef.showNextButton) {
        ctx?.advance()
        return
      }

      setConditionMet((prev) => (prev !== met ? met : prev))
    }

    poll()
    const interval = setInterval(poll, 500)
    return () => clearInterval(interval)
  }, [step, isStepInRange, stepDef, ctx])

  const { t } = useTranslation()

  const handleSkip = useCallback(() => {
    ctx?.skip()
    toast.info(t('onboarding.skippedNotice'))
  }, [ctx, t])

  if (!ctx) return null

  const { advance, skipStep } = ctx

  return (
    <>
      {/* Welcome dialog */}
      {state?.showWelcome && <WelcomeDialog />}

      {/* Active step overlay */}
      {isStepInRange && stepDef && (
        <>
          <SpotlightBackdrop targetRect={targetRect} />
          <InstructionTooltip
            targetRect={targetRect}
            stepDef={stepDef}
            currentStep={step}
            totalSteps={TOTAL_STEPS}
            conditionMet={conditionMet}
            onNext={advance}
            onSkipStep={skipStep}
            onSkip={handleSkip}
          />
        </>
      )}

      {/* Completion dialog */}
      {active && step > TOTAL_STEPS && <CompletionDialog />}
    </>
  )
}

export function OnboardingOverlay() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return createPortal(<OnboardingActiveOverlay />, document.body)
}
