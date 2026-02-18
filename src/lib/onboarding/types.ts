export type OnboardingCompletionType =
  | { type: 'manual' }
  | { type: 'event'; eventName: string }
  | { type: 'route'; pattern: string }
  | { type: 'condition'; check: string }

export interface OnboardingStepDef {
  id: number
  target: string
  /** Secondary target that takes priority when present in DOM (e.g., dialog opened by button click) */
  activeTarget?: string
  titleKey: string
  descriptionKey: string
  navigateTo?: string
  completion: OnboardingCompletionType
  showSkipButton?: boolean
  showNextButton?: boolean
}

export interface OnboardingState {
  active: boolean
  step: number
  projectId: number | null
  loading: boolean
  showWelcome: boolean
}

export interface OnboardingContextValue {
  state: OnboardingState
  advance: () => void
  skip: () => void
  skipStep: () => void
  restart: () => void
  setProjectId: (id: number) => void
  dismissWelcome: () => void
}
