import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BookmarkCheck01Icon,
  Copy01Icon,
  Delete02Icon,
  LinkSquare01Icon,
} from '@hugeicons/core-free-icons'
import { useTranslation } from '@/lib/i18n'
import { getDanbooruTagDetail } from '@/server/functions/danbooru'
import { getBundleNames } from './bundle-completion'

const SLOT_RE = /@\{slot:([^}]+)\}/g
const BUNDLE_RE = /@\{bundle:([^}]+)\}/g
// NAI weight syntax: number::content:: — content should not be treated as tags
const WEIGHT_RE = /(?<![a-zA-Z_])(-?\d+(?:\.\d+)?)::((?:[^:]|:(?!:))*?)::/g

export interface ContextMenuTarget {
  type: 'slot' | 'bundle' | 'tag'
  name: string
  /** Full matched text including syntax like @{slot:name} */
  fullText: string
  /** Position in document */
  from: number
  to: number
}

/**
 * Parse comma-separated tag segments from a text region.
 * Each segment is trimmed; @{...} references and empty segments are skipped.
 */
function parseTagSegments(
  text: string,
  baseOffset: number,
): Array<{ text: string; from: number; to: number }> {
  const segments: Array<{ text: string; from: number; to: number }> = []
  let start = 0
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === ',') {
      const raw = text.slice(start, i)
      const trimmed = raw.trim()
      if (trimmed && !trimmed.startsWith('@{')) {
        const trimStart = start + raw.indexOf(trimmed)
        segments.push({
          text: trimmed,
          from: baseOffset + trimStart,
          to: baseOffset + trimStart + trimmed.length,
        })
      }
      start = i + 1
    }
  }
  return segments
}

/** Detect what's at a position in the document */
export function detectTokenAt(
  doc: string,
  pos: number,
): ContextMenuTarget | null {
  // Check slot references
  for (const match of doc.matchAll(SLOT_RE)) {
    const from = match.index!
    const to = from + match[0].length
    if (pos >= from && pos <= to) {
      return { type: 'slot', name: match[1], fullText: match[0], from, to }
    }
  }

  // Check bundle references
  for (const match of doc.matchAll(BUNDLE_RE)) {
    const from = match.index!
    const to = from + match[0].length
    if (pos >= from && pos <= to) {
      return { type: 'bundle', name: match[1], fullText: match[0], from, to }
    }
  }

  // Check tags inside weight expressions first
  // Weight syntax: number::content:: — parse content as comma-separated tags
  for (const match of doc.matchAll(WEIGHT_RE)) {
    const weightFrom = match.index!
    const weightTo = weightFrom + match[0].length
    if (pos >= weightFrom && pos <= weightTo) {
      // Position is inside this weight expression
      // match[2] is the content between :: and ::
      const content = match[2]
      const contentStart = weightFrom + match[1].length + 2 // skip "number::"
      const innerSegments = parseTagSegments(content, contentStart)
      for (const seg of innerSegments) {
        if (pos >= seg.from && pos <= seg.to) {
          return {
            type: 'tag',
            name: seg.text,
            fullText: seg.text,
            from: seg.from,
            to: seg.to,
          }
        }
      }
      // Inside weight but not on a tag — no menu
      return null
    }
  }

  // Check regular tags (outside weight expressions)
  const segments = parseTagSegments(doc, 0)
  for (const seg of segments) {
    if (pos >= seg.from && pos <= seg.to) {
      // Make sure this segment doesn't overlap with a weight expression
      let insideWeight = false
      for (const match of doc.matchAll(WEIGHT_RE)) {
        const wFrom = match.index!
        const wTo = wFrom + match[0].length
        if (seg.from < wTo && seg.to > wFrom) {
          insideWeight = true
          break
        }
      }
      if (insideWeight) continue

      return {
        type: 'tag',
        name: seg.text,
        fullText: seg.text,
        from: seg.from,
        to: seg.to,
      }
    }
  }

  return null
}

interface EditorContextMenuProps {
  target: ContextMenuTarget
  x: number
  y: number
  onClose: () => void
  onDelete: (from: number, to: number) => void
}

export function EditorContextMenu({
  target,
  x,
  y,
  onClose,
  onDelete,
}: EditorContextMenuProps) {
  const { t } = useTranslation()
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [description, setDescription] = useState<string | null>(null)

  // Load info based on target type
  useEffect(() => {
    if (target.type === 'tag') {
      getDanbooruTagDetail({ data: target.name.replace(/\s/g, '_') })
        .then((info) => {
          if (info?.wikiBody) {
            // First sentence or first 100 chars
            const firstLine = info.wikiBody.split('\n')[0]
            setDescription(
              firstLine.length > 120
                ? firstLine.slice(0, 120) + '...'
                : firstLine,
            )
          }
        })
        .catch(() => {})
    } else if (target.type === 'bundle') {
      const bundle = getBundleNames().find((b) => b.name === target.name)
      if (bundle?.content) {
        setDescription(
          bundle.content.length > 120
            ? bundle.content.slice(0, 120) + '...'
            : bundle.content,
        )
      }
    }
  }, [target])

  // Close on click outside or Escape
  useEffect(() => {
    function handleClickOutside() {
      onClose()
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  function handleCopy() {
    navigator.clipboard.writeText(target.type === 'tag' ? target.name : target.fullText)
    onClose()
  }

  function handleDelete() {
    // Also clean up surrounding comma/whitespace
    onDelete(target.from, target.to)
    onClose()
  }

  function handleOpenPage() {
    if (target.type === 'tag') {
      window.open(`/tags?tag=${encodeURIComponent(target.name.replace(/\s/g, '_'))}`, '_blank')
    } else if (target.type === 'bundle') {
      window.open('/bundles', '_blank')
    }
    onClose()
  }

  // Position menu within viewport
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 300),
    zIndex: 100,
  }

  const typeLabel =
    target.type === 'slot'
      ? 'Slot'
      : target.type === 'bundle'
        ? 'Bundle'
        : 'Tag'

  return createPortal(
    <div
      style={menuStyle}
      className="min-w-[200px] rounded-md border border-border bg-popover shadow-lg overflow-hidden"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header: tag info */}
      <div className="px-3 py-2 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-2">
          {thumbnail && (
            <img
              src={thumbnail}
              alt=""
              className="size-8 rounded object-cover shrink-0"
            />
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {target.name.replace(/_/g, ' ')}
            </div>
            <div className="text-[10px] text-muted-foreground">{typeLabel}</div>
          </div>
        </div>
        {description && (
          <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">
            {description}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="py-1">
        {target.type !== 'slot' && (
          <button
            type="button"
            onClick={handleOpenPage}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            <HugeiconsIcon icon={LinkSquare01Icon} className="size-4 text-muted-foreground" />
            {target.type === 'tag'
              ? t('tagGallery.openFullPage')
              : t('bundles.title')}
          </button>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors"
        >
          <HugeiconsIcon icon={Copy01Icon} className="size-4 text-muted-foreground" />
          Copy
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-accent transition-colors"
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-4" />
          {t('common.delete')}
        </button>
      </div>
    </div>,
    document.body,
  )
}
