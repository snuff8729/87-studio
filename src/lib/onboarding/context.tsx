import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useRouterState } from '@tanstack/react-router'
import { getSetting, setSetting } from '@/server/functions/settings'
import { ONBOARDING_STEPS, TOTAL_STEPS } from './steps'
import type { OnboardingContextValue, OnboardingState } from './types'

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

export function useOnboarding() {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider')
  return ctx
}

export function useOnboardingMaybe() {
  return useContext(OnboardingContext)
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const routerState = useRouterState()
  const { pathname } = routerState.location

  const [state, setState] = useState<OnboardingState>({
    active: false,
    step: 0,
    projectId: null,
    loading: true,
    showWelcome: false,
  })

  const stateRef = useRef(state)
  stateRef.current = state
  const navigatedStepRef = useRef(-1)

  // Load initial state from settings
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [completed, step, projectId] = await Promise.all([
          getSetting({ data: 'onboarding_completed' }),
          getSetting({ data: 'onboarding_step' }),
          getSetting({ data: 'onboarding_project_id' }),
        ])
        if (cancelled) return

        if (completed === 'true') {
          setState((s) => ({ ...s, loading: false }))
          return
        }

        const savedStep = step ? parseInt(step, 10) : 0
        const savedProjectId = projectId ? parseInt(projectId, 10) : null

        if (savedStep === 0 && !step) {
          setState((s) => ({ ...s, loading: false, showWelcome: true }))
        } else {
          setState((s) => ({
            ...s,
            active: true,
            step: savedStep,
            projectId: savedProjectId,
            loading: false,
          }))
        }
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false }))
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Persist step
  useEffect(() => {
    if (state.active && !state.loading) {
      setSetting({ data: { key: 'onboarding_step', value: String(state.step) } })
    }
  }, [state.step, state.active, state.loading])

  // Persist projectId
  useEffect(() => {
    if (state.projectId != null && state.active) {
      setSetting({ data: { key: 'onboarding_project_id', value: String(state.projectId) } })
    }
  }, [state.projectId, state.active])

  // Navigate to step page
  useEffect(() => {
    if (!state.active || state.loading) return
    if (navigatedStepRef.current === state.step) return
    navigatedStepRef.current = state.step

    const stepDef = ONBOARDING_STEPS[state.step]
    if (!stepDef) return

    let targetPath = stepDef.navigateTo
    if (!targetPath && state.step >= 4 && state.projectId) {
      targetPath = `/workspace/${state.projectId}`
    }
    if (!targetPath) return
    if (targetPath === '/' ? pathname === '/' : pathname.startsWith(targetPath)) return

    router.navigate({ to: targetPath })
  }, [state.step, state.active, state.loading, state.projectId, pathname, router])

  // Listen for custom events (auto-advance steps)
  useEffect(() => {
    if (!state.active) return

    function handleEvent(e: Event) {
      const s = stateRef.current
      if (!s.active) return
      const stepDef = ONBOARDING_STEPS[s.step]
      if (!stepDef || stepDef.completion.type !== 'event') return
      if (e.type !== stepDef.completion.eventName) return

      if (e.type === 'onboarding:project-created') {
        const detail = (e as CustomEvent).detail
        if (detail?.projectId) {
          setState((prev) => ({ ...prev, projectId: detail.projectId }))
        }
      }

      doAdvance()
    }

    const events = [
      'onboarding:api-key-saved',
      'onboarding:project-created',
      'onboarding:generation-started',
    ]
    events.forEach((name) => window.addEventListener(name, handleEvent))
    return () => events.forEach((name) => window.removeEventListener(name, handleEvent))
  }, [state.active]) // eslint-disable-line react-hooks/exhaustive-deps

  // Route-based completion
  useEffect(() => {
    if (!state.active) return
    const stepDef = ONBOARDING_STEPS[state.step]
    if (!stepDef || stepDef.completion.type !== 'route') return

    if (pathname.includes(stepDef.completion.pattern)) {
      doAdvance()
    }
  }, [pathname, state.step, state.active]) // eslint-disable-line react-hooks/exhaustive-deps

  function doAdvance() {
    setState((prev) => {
      const nextStep = prev.step + 1
      if (nextStep > TOTAL_STEPS) {
        setSetting({ data: { key: 'onboarding_completed', value: 'true' } })
      }
      return { ...prev, step: nextStep }
    })
    navigatedStepRef.current = -1
  }

  const advance = useCallback(() => doAdvance(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const skip = useCallback(() => {
    setSetting({ data: { key: 'onboarding_completed', value: 'true' } })
    setState((prev) => ({ ...prev, active: false, showWelcome: false }))
  }, [])

  const skipStep = useCallback(() => doAdvance(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const restart = useCallback(async () => {
    await Promise.all([
      setSetting({ data: { key: 'onboarding_completed', value: '' } }),
      setSetting({ data: { key: 'onboarding_step', value: '0' } }),
      setSetting({ data: { key: 'onboarding_project_id', value: '' } }),
    ])
    navigatedStepRef.current = -1
    setState({
      active: false,
      step: 0,
      projectId: null,
      loading: false,
      showWelcome: true,
    })
  }, [])

  const setProjectId = useCallback((id: number) => {
    setState((prev) => ({ ...prev, projectId: id }))
  }, [])

  const dismissWelcome = useCallback(() => {
    setState((prev) => ({ ...prev, showWelcome: false, active: true, step: 1 }))
    navigatedStepRef.current = -1
  }, [])

  const value: OnboardingContextValue = {
    state,
    advance,
    skip,
    skipStep,
    restart,
    setProjectId,
    dismissWelcome,
  }

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  )
}
