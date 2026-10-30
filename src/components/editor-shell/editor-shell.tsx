import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { EditorLeftPanel } from './editor-left-panel'
import {
  EDITOR_LAYOUT_KEY_PREFIX,
  LAYOUT_DEFAULT,
  LAYOUT_LIMITS,
  PANEL_CENTER,
  PANEL_LEFT,
  PANEL_RIGHT,
  defaultEditorLayout,
  isPanelCollapsed,
  parseEditorLayout,
  readStorage,
  usePersistedTab,
  writeStorage,
} from './use-editor-persist'
import type { ReactNode } from 'react'
import type { Layout, PanelImperativeHandle } from 'react-resizable-panels'
import type { EditorLayout } from './use-editor-persist'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/use-mobile'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export type EditorTab = {
  id: string
  label: string
  badge?: number
  content: ReactNode
  /**
   * The content manages its own scrolling and fills the tab body (no outer
   * ScrollArea / padding), e.g. a virtualized list with a pinned bar.
   */
  fill?: boolean
  /** `data-onboarding` anchor on the tab trigger. */
  onboarding?: string
}

export type MobilePane = 'edit' | 'result' | 'history'

export interface EditorShellProps {
  /** Persistence namespace, e.g. 'quick-generate' */
  id: string
  /** Usually <EditorHeader/> */
  header: ReactNode
  tabs: Array<EditorTab>
  /** Generate footer */
  footer: ReactNode
  center: ReactNode
  right: ReactNode
  rightTitle: string
  /** Controlled (optional) */
  mobilePane?: MobilePane
  onMobilePaneChange?: (p: MobilePane) => void
}

export interface EditorShellContextValue {
  leftCollapsed: boolean
  rightCollapsed: boolean
  toggleLeft: () => void
  toggleRight: () => void
  isMobile: boolean
  mobilePane: MobilePane
  setMobilePane: (p: MobilePane) => void
}

const EditorShellContext = createContext<EditorShellContextValue | null>(null)

export function useEditorShell(): EditorShellContextValue {
  const ctx = useContext(EditorShellContext)
  if (!ctx) throw new Error('useEditorShell must be used inside <EditorShell>')
  return ctx
}

/** Viewports narrower than this start with the right panel collapsed. */
const TABLET_MAX_WIDTH = 1024

const MOBILE_PANES: Array<MobilePane> = ['edit', 'result', 'history']

function pct(n: number): string {
  return `${n}%`
}

/**
 * Collapse / expand a side panel. A panel that was collapsed at mount has no
 * "previous size" and `expand()` would restore it to its minSize, so bump it
 * to the default width in that case.
 */
function togglePanel(
  panel: PanelImperativeHandle,
  minSize: number,
  defaultSize: number,
) {
  if (!panel.isCollapsed()) {
    panel.collapse()
    return
  }
  panel.expand()
  if (panel.getSize().asPercentage <= minSize + 0.5) {
    panel.resize(pct(defaultSize))
  }
}

export function EditorShell({
  id,
  header,
  tabs,
  footer,
  center,
  right,
  rightTitle,
  mobilePane: mobilePaneProp,
  onMobilePaneChange,
}: EditorShellProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const layoutKey = EDITOR_LAYOUT_KEY_PREFIX + id

  // ── Tabs ──
  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs])
  const [activeTab, setActiveTab] = usePersistedTab(id, tabIds)

  // ── Mobile pane (controlled or uncontrolled) ──
  const [internalPane, setInternalPane] = useState<MobilePane>('edit')
  const mobilePane = mobilePaneProp ?? internalPane
  const setMobilePane = useCallback(
    (p: MobilePane) => {
      setInternalPane(p)
      onMobilePaneChange?.(p)
    },
    [onMobilePaneChange],
  )

  // ── Layout (read after mount: SSR-safe, no hydration mismatch) ──
  const [layout, setLayout] = useState<EditorLayout | null>(null)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const leftRef = useRef<PanelImperativeHandle | null>(null)
  const rightRef = useRef<PanelImperativeHandle | null>(null)
  // Don't persist the layout the group reports on mount; only after the user
  // (or a header toggle) changed something. Keeps the tablet default
  // (right collapsed) from being saved as a preference.
  const allowSaveRef = useRef(false)

  useEffect(() => {
    const stored = parseEditorLayout(readStorage(layoutKey))
    const initial =
      stored ?? defaultEditorLayout(window.innerWidth < TABLET_MAX_WIDTH)
    allowSaveRef.current = false
    setLayout(initial)
    setLeftCollapsed(isPanelCollapsed(initial.left))
    setRightCollapsed(isPanelCollapsed(initial.right))
  }, [layoutKey])

  const syncCollapsed = useCallback((next: Layout) => {
    setLeftCollapsed(isPanelCollapsed(next[PANEL_LEFT]))
    setRightCollapsed(isPanelCollapsed(next[PANEL_RIGHT]))
  }, [])

  const handleLayoutChanged = useCallback(
    (next: Layout, meta: { isUserInteraction: boolean }) => {
      syncCollapsed(next)
      if (meta.isUserInteraction) allowSaveRef.current = true
      if (!allowSaveRef.current) return
      const parsed = parseEditorLayout(JSON.stringify(next))
      if (!parsed) return
      // Keep for remounts (e.g. crossing the mobile breakpoint).
      setLayout(parsed)
      writeStorage(layoutKey, JSON.stringify(parsed))
    },
    [layoutKey, syncCollapsed],
  )

  const toggleLeft = useCallback(() => {
    const panel = leftRef.current
    if (!panel) return
    allowSaveRef.current = true
    togglePanel(panel, LAYOUT_LIMITS.left.min, LAYOUT_DEFAULT.left)
  }, [])

  const toggleRight = useCallback(() => {
    const panel = rightRef.current
    if (!panel) return
    allowSaveRef.current = true
    togglePanel(panel, LAYOUT_LIMITS.right.min, LAYOUT_DEFAULT.right)
  }, [])

  const ctx = useMemo<EditorShellContextValue>(
    () => ({
      leftCollapsed,
      rightCollapsed,
      toggleLeft,
      toggleRight,
      isMobile,
      mobilePane,
      setMobilePane,
    }),
    [
      leftCollapsed,
      rightCollapsed,
      toggleLeft,
      toggleRight,
      isMobile,
      mobilePane,
      setMobilePane,
    ],
  )

  const rightPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center border-b px-3 text-xs font-medium text-muted-foreground">
        <span className="truncate">{rightTitle}</span>
      </div>
      <div className="min-h-0 flex-1">{right}</div>
    </div>
  )

  let body: ReactNode
  if (layout === null) {
    // Pre-mount / SSR: storage and viewport unknown yet.
    body = <div className="min-h-0 flex-1" />
  } else if (isMobile) {
    // Crossing the 768px breakpoint swaps the desktop/mobile trees, which
    // remounts the panes (local component state resets). Accepted trade-off.
    const paneLabels: Record<MobilePane, string> = {
      edit: t('editor.edit'),
      result: t('editor.result'),
      history: t('editor.history'),
    }
    body = (
      <>
        <div className="relative min-h-0 flex-1">
          <div className={cn('h-full', mobilePane !== 'edit' && 'hidden')}>
            <EditorLeftPanel
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </div>
          <div className={cn('h-full', mobilePane !== 'result' && 'hidden')}>
            {center}
          </div>
          <div className={cn('h-full', mobilePane !== 'history' && 'hidden')}>
            {rightPane}
          </div>
        </div>
        <div className="shrink-0 border-t bg-background p-3">{footer}</div>
        <Tabs
          value={mobilePane}
          onValueChange={(v) => setMobilePane(v as MobilePane)}
          className="shrink-0 gap-0 border-t bg-sidebar pb-[env(safe-area-inset-bottom)]"
        >
          <TabsList
            variant="line"
            className="h-11 w-full rounded-none p-0 group-data-horizontal/tabs:h-11"
          >
            {MOBILE_PANES.map((p) => (
              <TabsTrigger
                key={p}
                value={p}
                className="h-full text-xs after:bg-primary group-data-horizontal/tabs:after:top-0 group-data-horizontal/tabs:after:bottom-auto data-active:text-primary dark:data-active:text-primary"
              >
                {paneLabels[p]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </>
    )
  } else {
    body = (
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup
          id={`editor-${id}`}
          orientation="horizontal"
          defaultLayout={layout}
          onLayoutChange={syncCollapsed}
          onLayoutChanged={handleLayoutChanged}
        >
          <ResizablePanel
            id={PANEL_LEFT}
            panelRef={leftRef}
            collapsible
            collapsedSize="0%"
            defaultSize={pct(LAYOUT_DEFAULT.left)}
            minSize={pct(LAYOUT_LIMITS.left.min)}
            maxSize={pct(LAYOUT_LIMITS.left.max)}
          >
            <EditorLeftPanel
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              footer={footer}
            />
          </ResizablePanel>
          <EditorResizeHandle />
          <ResizablePanel
            id={PANEL_CENTER}
            defaultSize={pct(LAYOUT_DEFAULT.center)}
            minSize={pct(LAYOUT_LIMITS.center.min)}
          >
            <div className="h-full min-h-0">{center}</div>
          </ResizablePanel>
          <EditorResizeHandle />
          <ResizablePanel
            id={PANEL_RIGHT}
            panelRef={rightRef}
            collapsible
            collapsedSize="0%"
            defaultSize={pct(LAYOUT_DEFAULT.right)}
            minSize={pct(LAYOUT_LIMITS.right.min)}
            maxSize={pct(LAYOUT_LIMITS.right.max)}
          >
            {rightPane}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    )
  }

  return (
    <EditorShellContext.Provider value={ctx}>
      <div className="flex h-full min-h-0 flex-col">
        {header}
        {body}
      </div>
    </EditorShellContext.Provider>
  )
}

/** 1px border line; the centered grip appears on hover / while dragging. */
function EditorResizeHandle() {
  return (
    <ResizableHandle
      withHandle
      className="transition-colors data-[separator=active]:bg-primary [&>div]:opacity-0 [&>div]:transition-opacity data-[separator=active]:[&>div]:bg-primary data-[separator=active]:[&>div]:opacity-100 data-[separator=focus]:[&>div]:opacity-100 data-[separator=hover]:[&>div]:bg-muted-foreground data-[separator=hover]:[&>div]:opacity-100"
    />
  )
}
