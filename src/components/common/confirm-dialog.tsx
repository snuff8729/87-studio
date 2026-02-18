import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useTranslation } from '@/lib/i18n'

interface ConfirmDialogBaseProps {
  title: string
  description: string
  actionLabel?: string
  variant?: 'destructive' | 'default'
  onConfirm: () => void | Promise<void>
}

interface TriggerProps extends ConfirmDialogBaseProps {
  trigger: React.ReactNode
  open?: never
  onOpenChange?: never
}

interface ControlledProps extends ConfirmDialogBaseProps {
  trigger?: never
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ConfirmDialogProps = TriggerProps | ControlledProps

export function ConfirmDialog({
  trigger,
  title,
  description,
  actionLabel,
  variant = 'destructive',
  onConfirm,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ConfirmDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const { t } = useTranslation()

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? controlledOnOpenChange! : setInternalOpen

  async function handleConfirm() {
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
      setOpen(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant={variant}
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
            disabled={loading}
          >
            {loading ? t('common.processing') : (actionLabel ?? t('common.delete'))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
