import { useOnboarding } from '@/lib/onboarding'
import { useTranslation } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function WelcomeDialog() {
  const { state, dismissWelcome, skip } = useOnboarding()
  const { t } = useTranslation()

  return (
    <Dialog open={state.showWelcome} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <span className="text-2xl font-bold text-primary">87</span>
          </div>
          <DialogTitle className="text-lg">
            {t('onboarding.welcome.title')}
          </DialogTitle>
          <DialogDescription className="text-balance">
            {t('onboarding.welcome.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          {[
            { emoji: '1', label: t('onboarding.step1.title') },
            { emoji: '2', label: t('onboarding.step2.title') },
            { emoji: '3', label: t('onboarding.step4.title') },
            { emoji: '4', label: t('onboarding.step5.title') },
            { emoji: '5', label: t('onboarding.step8.title') },
          ].map((item) => (
            <div
              key={item.emoji}
              className="flex items-center gap-3 text-sm text-muted-foreground"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {item.emoji}
              </span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={skip} className="order-2 sm:order-1">
            {t('onboarding.skipTutorial')}
          </Button>
          <Button onClick={dismissWelcome} className="order-1 sm:order-2">
            {t('onboarding.startTutorial')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
