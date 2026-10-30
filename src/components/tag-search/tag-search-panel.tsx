import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Copy01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { insertTagIntoLastEditor, useHasPromptEditor } from './editor-registry'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n'
import {
  GENERAL_TOP_CATEGORIES,
  TAG_CATEGORIES,
  categoryColor,
  categoryLabel,
  danbooruColor,
} from '@/lib/tag-categories'
import { formatCount, tagDisplayName } from '@/lib/tag-query'
import { cn } from '@/lib/utils'
import {
  getTagInfo,
  hasTagDb,
  searchTagsWindow,
} from '@/server/functions/tag-assist'

interface TabDef {
  id: string
  label: string
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

function FineBadge({ fine, top }: { fine: string; top: string }) {
  const { locale } = useTranslation()
  const color = categoryColor(top)
  return (
    <span
      className="rounded border px-1 text-[9px] leading-[14px] whitespace-nowrap"
      style={{
        color,
        borderColor: `color-mix(in oklch, ${color} 40%, transparent)`,
      }}
    >
      {categoryLabel(fine, locale)}
    </span>
  )
}

/** Search UI shared by the floating window and the mobile sheet. */
export function TagSearchPanel({
  inputRef,
  className,
}: {
  inputRef?: React.RefObject<HTMLInputElement | null>
  className?: string
}) {
  const { t, locale } = useTranslation()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')
  const [index, setIndex] = useState(0)
  const debounced = useDebounced(query, 150)
  const hasEditor = useHasPromptEditor()
  const listRef = useRef<HTMLDivElement>(null)

  const dbQuery = useQuery({
    queryKey: ['tag-db-installed'],
    queryFn: () => hasTagDb(),
    staleTime: Infinity,
  })

  const tabs: Array<TabDef> = useMemo(
    () => [
      { id: 'all', label: t('tagAssist.search.tabAll') },
      { id: 'character', label: categoryLabel('character', locale) },
      { id: 'artist', label: categoryLabel('artist', locale) },
      { id: 'copyright', label: categoryLabel('copyright', locale) },
      { id: 'general', label: t('tagAssist.search.tabGeneral') },
      ...GENERAL_TOP_CATEGORIES.filter((c) => c !== 'uncategorized').map(
        (c) => ({ id: c, label: categoryLabel(c, locale) }),
      ),
    ],
    [t, locale],
  )

  const subTabs = useMemo(
    () => TAG_CATEGORIES.filter((c) => c.parent === tab && c.key !== tab),
    [tab],
  )

  const results = useQuery({
    queryKey: ['tag-search', debounced, tab],
    queryFn: () =>
      searchTagsWindow({ data: { query: debounced, tab, limit: 200 } }),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  })
  const rows = useMemo(() => results.data ?? [], [results.data])

  useEffect(() => {
    setIndex(0)
    listRef.current?.scrollTo({ top: 0 })
  }, [debounced, tab])

  const selected = rows[Math.min(index, rows.length - 1)]

  const infoQuery = useQuery({
    queryKey: ['tag-info', selected?.name ?? null, locale],
    queryFn: () => getTagInfo({ data: { name: selected.name, locale } }),
    enabled: !!selected,
    staleTime: 5 * 60_000,
  })
  const info = infoQuery.data

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [index, rows])

  function add(name: string) {
    if (!insertTagIntoLastEditor(name)) return
    toast.success(t('tagAssist.search.added', { tag: tagDisplayName(name) }), {
      duration: 1200,
    })
  }

  function copy(name: string) {
    void navigator.clipboard
      ?.writeText(tagDisplayName(name))
      .then(() => toast.success(t('tagAssist.copied'), { duration: 1000 }))
      .catch(() => {})
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && selected && !e.nativeEvent.isComposing) {
      e.preventDefault()
      add(selected.name)
    }
  }

  const chip = (id: string, label: string, small = false) => (
    <button
      key={id}
      type="button"
      data-tab={id}
      data-active={tab === id}
      onClick={() => setTab(id)}
      className={cn(
        'shrink-0 rounded-full border px-2 py-0.5 transition-colors',
        small ? 'text-[10px]' : 'text-xs',
        tab === id
          ? 'border-primary/40 bg-primary/15 text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )

  if (dbQuery.data === false) {
    return (
      <div className={cn('p-4 text-sm text-muted-foreground', className)}>
        {t('tagAssist.search.noDb')}
      </div>
    )
  }

  return (
    <div
      className={cn('flex min-h-0 flex-1 flex-col', className)}
      data-tag-search-panel
    >
      <div className="relative px-3 pt-3">
        <HugeiconsIcon
          icon={Search01Icon}
          className="pointer-events-none absolute top-1/2 left-5.5 size-4 translate-y-[-30%] text-muted-foreground"
        />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('tagAssist.search.placeholder')}
          className="pl-8"
          autoComplete="off"
          spellCheck={false}
          data-tag-search-input
        />
      </div>
      <div
        className="flex gap-1.5 overflow-x-auto px-3 pt-2 pb-1 [scrollbar-width:thin]"
        data-tag-tabs
      >
        {tabs.map((tb) => chip(tb.id, tb.label))}
      </div>
      {subTabs.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:thin]">
          {chip(tab, tabs.find((x) => x.id === tab)?.label ?? tab, true)}
          {subTabs.map((c) => chip(c.key, categoryLabel(c.key, locale), true))}
        </div>
      )}
      <div
        ref={listRef}
        className="min-h-24 flex-1 overflow-y-auto border-t"
        role="listbox"
        data-tag-results
      >
        {rows.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {results.isFetching
              ? t('tagAssist.search.loading')
              : t('tagAssist.search.empty')}
          </div>
        )}
        {rows.map((r, i) => (
          <button
            key={r.name}
            type="button"
            role="option"
            aria-selected={i === index}
            data-selected={i === index}
            data-tag-row={r.name}
            onClick={() => setIndex(i)}
            onDoubleClick={() => add(r.name)}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1 text-left text-sm',
              i === index ? 'bg-accent' : 'hover:bg-accent/50',
            )}
          >
            <span
              className="min-w-0 flex-1 truncate"
              style={{ color: danbooruColor(r.category) }}
            >
              {tagDisplayName(r.name)}
            </span>
            <FineBadge fine={r.fine} top={r.top} />
            <span className="w-10 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
              {formatCount(r.postCount)}
            </span>
          </button>
        ))}
      </div>
      <div
        className="flex max-h-[45%] min-h-28 shrink-0 flex-col border-t bg-muted/20 text-xs"
        data-tag-detail
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {!selected ? (
            <div className="text-muted-foreground">
              {t('tagAssist.search.selectHint')}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className="min-w-0 flex-1 truncate text-sm font-semibold"
                  style={{ color: danbooruColor(selected.category) }}
                >
                  {tagDisplayName(selected.name)}
                </span>
                <FineBadge fine={selected.fine} top={selected.top} />
                <span className="text-muted-foreground">
                  {t('tagAssist.posts', {
                    count: formatCount(selected.postCount),
                  })}
                </span>
              </div>
              <p
                className={cn(
                  'whitespace-pre-wrap break-words',
                  !info?.description && 'text-muted-foreground',
                )}
              >
                {info?.description ?? t('tagAssist.noDescription')}
              </p>
              {info && (
                <div className="space-y-1">
                  {(
                    [
                      [t('tagAssist.aliases'), info.aliases],
                      [t('tagAssist.implies'), info.implies],
                      [t('tagAssist.impliedBy'), info.impliedBy],
                      [t('tagAssist.sameGroup'), info.sameGroup?.tags ?? []],
                    ] as Array<[string, Array<string>]>
                  ).map(([label, names]) =>
                    names.length === 0 ? null : (
                      <div
                        key={label}
                        className="flex flex-wrap items-center gap-1"
                      >
                        <span className="text-muted-foreground">{label}</span>
                        {names.map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setQuery(tagDisplayName(n))}
                            className="rounded-full border px-1.5 text-[10px] hover:bg-accent"
                          >
                            {tagDisplayName(n)}
                          </button>
                        ))}
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {selected && (
          <div className="flex shrink-0 items-center gap-2 border-t p-2">
            <Button
              size="sm"
              disabled={!hasEditor}
              onClick={() => add(selected.name)}
              data-tag-add
            >
              {t('tagAssist.search.add')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy(selected.name)}
            >
              <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
              {t('tagAssist.copy')}
            </Button>
            {!hasEditor && (
              <span className="text-[10px] text-muted-foreground">
                {t('tagAssist.search.noEditor')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
