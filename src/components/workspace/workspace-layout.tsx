import type { ReactNode } from 'react'

interface WorkspaceLayoutProps {
  header: ReactNode
  leftPanel: ReactNode
  centerPanel: ReactNode
  rightPanel: ReactNode
  bottomToolbar: ReactNode
  leftOpen: boolean
  rightOpen: boolean
  onDismiss: () => void
}

export function WorkspaceLayout({
  header,
  leftPanel,
  centerPanel,
  rightPanel,
  bottomToolbar,
  leftOpen,
  rightOpen,
  onDismiss,
}: WorkspaceLayoutProps) {
  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      {header}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Panel — Prompts */}
        <aside
          className={`
            ${leftOpen ? 'translate-x-0' : '-translate-x-full'}
            fixed top-12 bottom-22 lg:bottom-12 left-0 z-30 w-72 bg-background border-r border-border
            transition-transform duration-200 ease-in-out
            lg:static lg:translate-x-0 lg:w-[280px] lg:shrink-0
            overflow-y-auto
          `}
        >
          {leftPanel}
        </aside>

        {/* Center Panel — Scene Workspace */}
        <main className="flex-1 overflow-y-auto min-w-0">
          {centerPanel}
        </main>

        {/* Right Panel — History */}
        <aside
          className={`
            ${rightOpen ? 'translate-x-0' : 'translate-x-full'}
            fixed top-12 bottom-22 lg:bottom-12 right-0 z-30 w-56 bg-background border-l border-border
            transition-transform duration-200 ease-in-out
            lg:static lg:translate-x-0 lg:w-[220px] lg:shrink-0
            overflow-y-auto
          `}
        >
          {rightPanel}
        </aside>
      </div>
      {bottomToolbar}

      {/* Mobile backdrop */}
      {(leftOpen || rightOpen) && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={onDismiss}
        />
      )}
    </div>
  )
}
