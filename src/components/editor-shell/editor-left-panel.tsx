import type { ReactNode } from 'react'
import type { EditorTab } from './editor-shell'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface EditorLeftPanelProps {
  tabs: Array<EditorTab>
  activeTab: string
  onTabChange: (id: string) => void
  /** Pinned below the scrolling tab body. Omitted on mobile (shell pins it). */
  footer?: ReactNode
  className?: string
}

export function EditorLeftPanel({
  tabs,
  activeTab,
  onTabChange,
  footer,
  className,
}: EditorLeftPanelProps) {
  const activeFills = tabs.some((tab) => tab.id === activeTab && tab.fill)
  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <Tabs
        value={activeTab}
        onValueChange={onTabChange}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList
          variant="line"
          className="h-10 w-full shrink-0 justify-start gap-0 overflow-x-auto rounded-none border-b px-1 group-data-horizontal/tabs:h-10"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              data-onboarding={tab.onboarding}
              className="h-full flex-none px-2.5 text-xs after:bg-primary group-data-horizontal/tabs:after:bottom-0"
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="min-w-4 rounded-full bg-muted px-1 text-center text-[10px] leading-4 font-medium text-muted-foreground tabular-nums">
                  {tab.badge}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <ScrollArea
          className={cn(
            'min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!',
            activeFills && 'hidden',
          )}
        >
          {tabs
            .filter((tab) => !tab.fill)
            .map((tab) => (
              <TabsContent
                key={tab.id}
                value={tab.id}
                forceMount
                className="p-3 data-[state=inactive]:hidden"
              >
                {tab.content}
              </TabsContent>
            ))}
        </ScrollArea>
        {tabs
          .filter((tab) => tab.fill)
          .map((tab) => (
            <TabsContent
              key={tab.id}
              value={tab.id}
              forceMount
              className="min-h-0 flex-1 data-[state=inactive]:hidden"
            >
              {tab.content}
            </TabsContent>
          ))}
      </Tabs>
      {footer ? (
        <div className="shrink-0 border-t bg-background p-3">{footer}</div>
      ) : null}
    </div>
  )
}
