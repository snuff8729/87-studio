import type { OnboardingStepDef } from './types'

export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  {
    id: 0,
    target: 'welcome',
    titleKey: 'onboarding.welcome.title',
    descriptionKey: 'onboarding.welcome.description',
    completion: { type: 'manual' },
  },
  {
    id: 1,
    target: 'api-key-section',
    titleKey: 'onboarding.step1.title',
    descriptionKey: 'onboarding.step1.description',
    navigateTo: '/settings',
    completion: { type: 'event', eventName: 'onboarding:api-key-saved' },
    showSkipButton: true,
  },
  {
    id: 2,
    target: 'new-project-btn',
    activeTarget: 'create-project-dialog',
    titleKey: 'onboarding.step2.title',
    descriptionKey: 'onboarding.step2.description',
    navigateTo: '/',
    completion: { type: 'event', eventName: 'onboarding:project-created' },
  },
  {
    id: 3,
    target: 'project-card',
    titleKey: 'onboarding.step3.title',
    descriptionKey: 'onboarding.step3.description',
    navigateTo: '/',
    completion: { type: 'route', pattern: '/workspace/' },
  },
  {
    id: 4,
    target: 'prompt-editor',
    titleKey: 'onboarding.step4.title',
    descriptionKey: 'onboarding.step4.description',
    completion: { type: 'condition', check: 'prompt-has-placeholder' },
    showNextButton: true,
  },
  {
    id: 5,
    target: 'add-scene-btn',
    activeTarget: 'add-scene-form',
    titleKey: 'onboarding.step5.title',
    descriptionKey: 'onboarding.step5.description',
    completion: { type: 'condition', check: 'scene-exists' },
  },
  {
    id: 6,
    target: 'scene-edit-tab',
    titleKey: 'onboarding.step6.title',
    descriptionKey: 'onboarding.step6.description',
    completion: { type: 'condition', check: 'scene-selected-in-edit' },
  },
  {
    id: 7,
    target: 'placeholder-editor',
    titleKey: 'onboarding.step7.title',
    descriptionKey: 'onboarding.step7.description',
    completion: { type: 'condition', check: 'placeholder-filled' },
    showNextButton: true,
  },
  {
    id: 8,
    target: 'generation-controls',
    titleKey: 'onboarding.step8.title',
    descriptionKey: 'onboarding.step8.description',
    completion: { type: 'event', eventName: 'onboarding:generation-started' },
  },
]

export const TOTAL_STEPS = ONBOARDING_STEPS.length - 1 // exclude welcome step
