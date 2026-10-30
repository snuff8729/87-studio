import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft02Icon } from '@hugeicons/core-free-icons'
import type { ReactNode } from 'react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

const LAYOUT_KEY_PREFIX = '87studio-master-detail:'
const LIST_DEFAULT = 30
const LIST_MIN = 20
const LIST_MAX = 50

type MasterDetailLayout = { list: number; detail: number }

function readLayout(key: string): MasterDetailLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY_PREFIX + key)
    if (raw) {
      const v = JSON.parse(raw) as Partial<MasterDetailLayout>
      if (
        typeof v.list === 'number' &&
        v.list >= LIST_MIN - 0.5 &&
        v.list <= LIST_MAX + 0.5
      ) {
        return { list: v.list, detail: 100 - v.list }
      }
    }
  } catch {}
  return { list: LIST_DEFAULT, detail: 100 - LIST_DEFAULT }
}

/**
 * Master-detail frame: a resizable (persisted) list pane next to the detail
 * pane on wide screens; on mobile only one of them is shown and the detail
 * has a back button.
 */
export function MasterDetail({
  id,
  list,
  detail,
  hasSelection,
  onBack,
  backLabel,
  className,
}: {
  /** Storage id for the pane layout */
  id: string
  list: ReactNode
  detail: ReactNode
  hasSelection: boolean
  onBack: () => void
  backLabel: string
  className?: string
}) {
  const isMobile = useIsMobile()
  // Read after mount: SSR-safe, no hydration mismatch
  const [layout, setLayout] = useState<MasterDetailLayout | null>(null)

  useEffect(() => {
    setLayout(readLayout(id))
  }, [id])

  const frame = cn(
    'h-[calc(100svh-5rem)] min-h-0 overflow-hidden rounded-xl border border-border bg-card/30 md:h-[calc(100svh-6rem)]',
    className,
  )

  if (isMobile) {
    return (
      <div data-master-detail="mobile" className={frame}>
        {hasSelection ? (
          <div className="flex h-full min-h-0 flex-col">
            <button
              type="button"
              onClick={onBack}
              data-master-detail-back
              className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon icon={ArrowLeft02Icon} className="size-4" />
              {backLabel}
            </button>
            <div className="min-h-0 flex-1 overflow-y-auto">{detail}</div>
          </div>
        ) : (
          <div className="h-full min-h-0">{list}</div>
        )}
      </div>
    )
  }

  if (!layout) return <div className={frame} />

  return (
    <div data-master-detail="desktop" className={frame}>
      <ResizablePanelGroup
        id={`master-detail-${id}`}
        orientation="horizontal"
        defaultLayout={layout}
        onLayoutChanged={(next, meta) => {
          if (!meta.isUserInteraction) return
          const size = next.list
          if (size < LIST_MIN - 0.5 || size > LIST_MAX + 0.5) return
          try {
            localStorage.setItem(
              LAYOUT_KEY_PREFIX + id,
              JSON.stringify({ list: size, detail: 100 - size }),
            )
          } catch {}
        }}
      >
        <ResizablePanel
          id="list"
          defaultSize={`${LIST_DEFAULT}%`}
          minSize={`${LIST_MIN}%`}
          maxSize={`${LIST_MAX}%`}
        >
          <div className="h-full min-h-0">{list}</div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="detail" minSize="30%">
          <div className="h-full min-h-0 overflow-y-auto">{detail}</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
