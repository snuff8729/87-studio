import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { TagSearchPanel } from './tag-search-panel'
import type { WindowRect } from '@/lib/floating-window'
import { useTranslation } from '@/lib/i18n'
import { clampRect, defaultRect, parseRect } from '@/lib/floating-window'

export const TAG_SEARCH_WINDOW_KEY = '87studio-tag-search-window'

function loadRect(): WindowRect {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let saved: WindowRect | null = null
  try {
    saved = parseRect(localStorage.getItem(TAG_SEARCH_WINDOW_KEY))
  } catch {
    /* ignore */
  }
  return saved ? clampRect(saved, vw, vh) : defaultRect(vw, vh)
}

function saveRect(rect: WindowRect | null) {
  try {
    if (rect) localStorage.setItem(TAG_SEARCH_WINDOW_KEY, JSON.stringify(rect))
    else localStorage.removeItem(TAG_SEARCH_WINDOW_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Non-modal floating Tag Search window: drag by the title bar, resize from the
 * bottom-right corner, position/size persisted, double-click title = reset.
 * `container` (a Radix dialog's content) hosts it while a modal is open.
 */
export function TagSearchWindow({
  container,
  onClose,
  inputRef,
}: {
  container: HTMLElement | null
  onClose: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const { t } = useTranslation()
  const [rect, setRect] = useState<WindowRect>(loadRect)
  const rectRef = useRef(rect)
  rectRef.current = rect
  const drag = useRef<{
    mode: 'move' | 'resize'
    startX: number
    startY: number
    start: WindowRect
  } | null>(null)
  const [host, setHost] = useState<HTMLElement>(() => document.body)
  const [origin, setOrigin] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLDivElement>(null)

  // Host: the dialog content while it is open, else <body>. A host that
  // establishes a containing block for fixed children (transform, translate,
  // ...) shifts our coordinates, so measure where left/top 0 really lands.
  useLayoutEffect(() => {
    const target = container?.isConnected ? container : document.body
    setHost(target)
  }, [container])

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const prevLeft = node.style.left
    const prevTop = node.style.top
    node.style.left = '0px'
    node.style.top = '0px'
    const r = node.getBoundingClientRect()
    node.style.left = prevLeft
    node.style.top = prevTop
    setOrigin((o) =>
      Math.abs(o.x - r.left) < 0.5 && Math.abs(o.y - r.top) < 0.5
        ? o
        : { x: r.left, y: r.top },
    )
  }, [host])

  useEffect(() => {
    function onResize() {
      setRect((r) => clampRect(r, window.innerWidth, window.innerHeight))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const begin = useCallback(
    (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
      if (e.button !== 0) return
      if ((e.target as HTMLElement).closest('button')) return
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      drag.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        start: rectRef.current,
      }
    },
    [],
  )

  const move = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    const next =
      d.mode === 'move'
        ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy }
        : { ...d.start, w: d.start.w + dx, h: d.start.h + dy }
    setRect(clampRect(next, window.innerWidth, window.innerHeight))
  }, [])

  const end = useCallback(() => {
    if (!drag.current) return
    drag.current = null
    saveRect(rectRef.current)
  }, [])

  function reset() {
    saveRect(null)
    setRect(defaultRect(window.innerWidth, window.innerHeight))
  }

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={t('tagAssist.search.title')}
      data-tag-search-window
      className="fixed z-[60] flex flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
      style={{
        left: rect.x - origin.x,
        top: rect.y - origin.y,
        width: rect.w,
        height: rect.h,
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div
        data-tag-search-titlebar
        title={t('tagAssist.search.resetHint')}
        className="flex h-9 shrink-0 cursor-grab touch-none items-center gap-2 border-b bg-muted/40 px-3 select-none active:cursor-grabbing"
        onPointerDown={begin('move')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={reset}
      >
        <HugeiconsIcon
          icon={Search01Icon}
          className="size-4 text-muted-foreground"
        />
        <span className="flex-1 text-sm font-medium">
          {t('tagAssist.search.title')}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          title={t('tagAssist.search.close')}
          data-tag-search-close
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </button>
      </div>
      <TagSearchPanel inputRef={inputRef} />
      <div
        data-tag-search-resize
        className="absolute right-0 bottom-0 size-4 cursor-nwse-resize touch-none"
        onPointerDown={begin('resize')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <svg viewBox="0 0 16 16" className="size-4 text-muted-foreground/60">
          <path
            d="M14 6 6 14M14 10l-4 4M14 2 2 14"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
        </svg>
      </div>
    </div>,
    host,
  )
}
