import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { TagSearchPanel } from './tag-search-panel'
import { TagSearchWindow } from './tag-search-window'
import { MODAL_SELECTOR } from '@/components/editor-shell/use-generate-shortcut'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import { useTranslation } from '@/lib/i18n'

interface OpenOptions {
  /** Host element (a Radix dialog's content) when a modal is open */
  container?: HTMLElement | null
}

interface TagSearchContextValue {
  open: boolean
  openSearch: (opts?: OpenOptions) => void
  closeSearch: () => void
}

const TagSearchContext = createContext<TagSearchContextValue | null>(null)

export function useTagSearch(): TagSearchContextValue {
  const ctx = useContext(TagSearchContext)
  if (!ctx)
    throw new Error('useTagSearch must be used within TagSearchProvider')
  return ctx
}

export function isTagSearchShortcut(e: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}): boolean {
  return (
    e.key.toLowerCase() === 'f' &&
    (e.ctrlKey || e.metaKey) &&
    e.shiftKey &&
    !e.altKey
  )
}

export function TagSearchProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const openRef = useRef(open)
  openRef.current = open

  const focusInput = useCallback(() => {
    // after mount / sheet animation
    for (const ms of [0, 120, 300]) {
      setTimeout(() => {
        const el = inputRef.current
        if (el && document.activeElement !== el) el.focus()
      }, ms)
    }
  }, [])

  const openSearch = useCallback(
    (opts?: OpenOptions) => {
      setContainer(opts?.container ?? null)
      setOpen(true)
      focusInput()
    },
    [focusInput],
  )
  const closeSearch = useCallback(() => setOpen(false), [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!isTagSearchShortcut(e) || e.isComposing) return
      if (openRef.current) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        return
      }
      // Another modal owns the screen: leave the shortcut alone
      if (document.querySelector(MODAL_SELECTOR)) return
      e.preventDefault()
      e.stopPropagation()
      setContainer(null)
      setOpen(true)
      focusInput()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [focusInput])

  const value = useMemo(
    () => ({ open, openSearch, closeSearch }),
    [open, openSearch, closeSearch],
  )

  return (
    <TagSearchContext.Provider value={value}>
      {children}
      {open && !isMobile && (
        <TagSearchWindow
          container={container}
          onClose={closeSearch}
          inputRef={inputRef}
        />
      )}
      {isMobile && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            className="gap-0 p-0 data-[side=bottom]:h-[60vh]"
            data-tag-search-sheet
          >
            <SheetHeader className="p-3 pr-12">
              <SheetTitle>{t('tagAssist.search.title')}</SheetTitle>
            </SheetHeader>
            <TagSearchPanel inputRef={inputRef} />
          </SheetContent>
        </Sheet>
      )}
    </TagSearchContext.Provider>
  )
}
