import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Image02Icon } from '@hugeicons/core-free-icons'
import type { ImportRow } from '@/lib/naia-import'
import type { NaiaPreviewRow } from '@/server/functions/naia-import'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  getNaiaDir,
  previewNaiaImport,
  runNaiaImport,
} from '@/server/functions/naia-import'

const DEFAULT_DIR =
  'C:\\Users\\User\\Documents\\LLM\\NAIA-Portable\\user-data\\save\\snapshots\\NAI'
const GROUP_H = 36
const ROW_H = 60

type Entry =
  | { kind: 'group'; key: string; label: string; rows: Array<NaiaPreviewRow> }
  | { kind: 'row'; key: string; row: NaiaPreviewRow }

const isSelectable = (r: ImportRow) => r.status !== 'error'
const isDefaultChecked = (r: ImportRow) =>
  r.status !== 'error' && r.status !== 'unchanged'

export function NaiaImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}) {
  const { t } = useTranslation()
  const [dir, setDir] = useState('')
  const [rows, setRows] = useState<Array<NaiaPreviewRow> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Folder the shown rows were scanned from (Import needs a matching path)
  const [scannedDir, setScannedDir] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Remember the last used folder (falls back to the usual NAIA location)
  useEffect(() => {
    if (!open) return
    getNaiaDir().then((saved) => setDir((cur) => cur || saved || DEFAULT_DIR))
  }, [open])

  async function scan() {
    setScanning(true)
    setError(null)
    try {
      const res = await previewNaiaImport({ data: { dir } })
      if (!res.ok) {
        setRows(null)
        setError(res.error)
        return
      }
      setDir(res.dir)
      setScannedDir(res.dir)
      setRows(res.rows)
      setSelected(new Set(res.rows.filter(isDefaultChecked).map((r) => r.key)))
    } catch (e) {
      setRows(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setScanning(false)
    }
  }

  const entries = useMemo<Array<Entry>>(() => {
    if (!rows) return []
    const groups = new Map<string, Array<NaiaPreviewRow>>()
    for (const r of rows) {
      const key = r.folderTag ?? ''
      groups.set(key, [...(groups.get(key) ?? []), r])
    }
    const keys = [...groups.keys()].sort((a, b) => {
      if (a === '') return 1
      if (b === '') return -1
      return a.localeCompare(b)
    })
    return keys.flatMap<Entry>((key) => {
      const list = groups.get(key) ?? []
      return [
        {
          kind: 'group',
          key: `g:${key}`,
          label: key || t('bundles.importNoFolder'),
          rows: list,
        },
        ...list.map<Entry>((row) => ({
          kind: 'row',
          key: `r:${row.key}`,
          row,
        })),
      ]
    })
  }, [rows, t])

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (entries[i].kind === 'group' ? GROUP_H : ROW_H),
    getItemKey: (i) => entries[i].key,
    overscan: 8,
  })

  function toggle(name: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(name)
      else next.delete(name)
      return next
    })
  }

  function toggleGroup(list: Array<NaiaPreviewRow>, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const r of list.filter(isSelectable)) {
        if (on) next.add(r.key)
        else next.delete(r.key)
      }
      return next
    })
  }

  async function doImport() {
    setImporting(true)
    try {
      const res = await runNaiaImport({
        data: { dir: scannedDir ?? dir, keys: [...selected] },
      })
      toast.success(
        t('bundles.importDone', { created: res.created, updated: res.updated }),
      )
      onImported()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('bundles.importFailed'))
    } finally {
      setImporting(false)
    }
  }

  const count = selected.size
  const dirChanged =
    scannedDir !== null && dir.trim().replace(/^["']|["']$/g, '') !== scannedDir

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-w-none md:top-1/2 md:left-1/2 md:h-[85vh] md:w-[min(860px,94vw)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl"
        data-naia-import-dialog
      >
        <DialogHeader className="shrink-0 gap-2 border-b border-border p-4 pr-14">
          <DialogTitle>{t('bundles.importNaia')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('bundles.importNaiaDesc')}
          </DialogDescription>
          <div className="flex gap-2">
            <Input
              value={dir}
              onChange={(e) => setDir(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') scan()
              }}
              placeholder={DEFAULT_DIR}
              aria-label={t('bundles.importFolder')}
              aria-invalid={!!error}
              data-naia-dir
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <Button
              onClick={scan}
              disabled={scanning || !dir.trim()}
              data-naia-scan
            >
              {scanning ? t('bundles.importScanning') : t('bundles.importScan')}
            </Button>
          </div>
          {error ? (
            <p className="text-xs text-destructive" data-naia-error>
              {error}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t('bundles.importNaiaDesc')}
            </p>
          )}
        </DialogHeader>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {rows === null ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {t('bundles.importPrompt')}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {t('bundles.importEmpty')}
            </div>
          ) : (
            <div
              style={{
                height: virtualizer.getTotalSize(),
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((v) => {
                const e = entries[v.index]
                return (
                  <div
                    key={v.key}
                    className="absolute inset-x-0"
                    style={{ top: v.start, height: v.size }}
                  >
                    {e.kind === 'group' ? (
                      <GroupHeader
                        label={e.label}
                        rows={e.rows}
                        selected={selected}
                        onToggle={(on) => toggleGroup(e.rows, on)}
                      />
                    ) : (
                      <Row
                        row={e.row}
                        checked={selected.has(e.row.key)}
                        onChange={(on) => toggle(e.row.key, on)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-border p-3 sm:justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">
            {dirChanged
              ? t('bundles.importRescan')
              : rows
                ? t('bundles.importFound', { count: rows.length })
                : ''}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={doImport}
              disabled={count === 0 || importing || dirChanged}
              data-naia-import
            >
              {t('bundles.importCount', { count })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GroupHeader({
  label,
  rows,
  selected,
  onToggle,
}: {
  label: string
  rows: Array<NaiaPreviewRow>
  selected: Set<string>
  onToggle: (on: boolean) => void
}) {
  const selectable = rows.filter(isSelectable)
  const n = selectable.filter((r) => selected.has(r.key)).length
  const state: boolean | 'indeterminate' =
    n === 0 ? false : n === selectable.length ? true : 'indeterminate'
  return (
    <div className="flex h-full items-center gap-3 border-b border-border bg-secondary/40 px-4">
      <Checkbox
        checked={state}
        disabled={selectable.length === 0}
        onCheckedChange={(v) => onToggle(v === true)}
        aria-label={label}
        data-naia-group={label}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {label}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {rows.length}
      </span>
    </div>
  )
}

function Row({
  row,
  checked,
  onChange,
}: {
  row: NaiaPreviewRow
  checked: boolean
  onChange: (on: boolean) => void
}) {
  const { t } = useTranslation()
  const isError = row.status === 'error'
  return (
    <div
      data-naia-import-row={row.key}
      data-status={row.status}
      className={cn(
        'flex h-full items-center gap-3 border-b border-border/50 px-4',
        isError && 'opacity-70',
      )}
    >
      <Checkbox
        checked={checked}
        disabled={isError}
        onCheckedChange={(v) => onChange(v === true)}
        aria-label={row.name}
      />
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary">
        {row.thumb ? (
          <img src={row.thumb} alt="" className="size-full object-cover" />
        ) : (
          <HugeiconsIcon
            icon={Image02Icon}
            className="size-4 text-muted-foreground/30"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium" title={row.name}>
            {row.name}
          </span>
          <StatusBadge status={row.status} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {isError
            ? row.reason
            : row.status === 'renamed'
              ? t('bundles.importRenamedTo', { name: row.targetName })
              : row.status === 'update' && row.diff
                ? diffText(row, t)
                : ''}
        </p>
      </div>
    </div>
  )
}

function diffText(row: ImportRow, t: (key: any, p?: any) => string): string {
  const diff = row.diff ?? []
  const shown = diff
    .slice(0, 3)
    .map((d) =>
      d.field === 'prompt' || d.field === 'negative'
        ? t('bundles.importChanged', { field: d.field })
        : `${d.field} ${d.from} → ${d.to}`,
    )
    .join(' · ')
  return diff.length > 3 ? `${shown} · +${diff.length - 3}` : shown
}

function StatusBadge({ status }: { status: ImportRow['status'] }) {
  const { t } = useTranslation()
  const cls: Record<ImportRow['status'], string> = {
    new: 'border-primary/40 bg-primary/10 text-primary',
    update: 'border-primary/40 bg-primary/10 text-primary',
    renamed: 'border-border bg-secondary text-muted-foreground',
    unchanged: 'border-border bg-secondary text-muted-foreground',
    error: 'border-destructive/40 bg-destructive/10 text-destructive',
  }
  return (
    <span
      data-naia-status={status}
      className={cn(
        'shrink-0 rounded border px-1 text-[10px] leading-4',
        cls[status],
      )}
    >
      {t(`bundles.importStatus.${status}` as any)}
    </span>
  )
}
