import { HugeiconsIcon } from '@hugeicons/react'
import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from '@hugeicons/core-free-icons'
import { useEditorShell } from './editor-shell'
import type { IconSvgElement } from '@hugeicons/react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useTranslation } from '@/lib/i18n'

interface EditorHeaderProps {
  title: ReactNode
  actions?: ReactNode
}

export function EditorHeader({ title, actions }: EditorHeaderProps) {
  const { t } = useTranslation()
  const { leftCollapsed, rightCollapsed, toggleLeft, toggleRight, isMobile } =
    useEditorShell()

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-sidebar px-3">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-1 data-vertical:h-4 data-vertical:self-center"
      />
      <div className="min-w-0 flex-1 truncate text-sm font-medium">{title}</div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
      {!isMobile && (
        <div className="flex items-center gap-0.5">
          <PanelToggle
            icon={leftCollapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon}
            label={
              leftCollapsed
                ? t('editor.showLeftPanel')
                : t('editor.hideLeftPanel')
            }
            onClick={toggleLeft}
          />
          <PanelToggle
            icon={rightCollapsed ? PanelRightOpenIcon : PanelRightCloseIcon}
            label={
              rightCollapsed
                ? t('editor.showRightPanel')
                : t('editor.hideRightPanel')
            }
            onClick={toggleRight}
          />
        </div>
      )}
    </header>
  )
}

function PanelToggle({
  icon,
  label,
  onClick,
}: {
  icon: IconSvgElement
  label: string
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onClick}>
          <HugeiconsIcon icon={icon} strokeWidth={2} />
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
