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
import { TOTAL_STEPS } from '@/lib/onboarding/steps'

export function CompletionDialog() {
  const { state, skip } = useOnboarding()
  const { t } = useTranslation()

  const isOpen = state.active && state.step > TOTAL_STEPS

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <span className="text-3xl font-bold text-primary">
              {'\u2713'}
            </span>
          </div>
          <DialogTitle className="text-lg">
            {t('onboarding.completion.title')}
          </DialogTitle>
          <DialogDescription className="text-balance">
            {t('onboarding.completion.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          <Button onClick={skip} className="min-w-[120px]">
            {t('onboarding.finish')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
