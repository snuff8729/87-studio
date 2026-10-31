import { Suspense, lazy, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { BookmarkCheck01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import type { EditorBundle } from './bundle-completion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TagGalleryDialog } from '@/components/tag-gallery/tag-gallery-dialog'
import { appendTag } from '@/components/tag-gallery/use-tag-gallery'
import { useTagSearch } from '@/components/tag-search/tag-search-provider'
import { useTranslation } from '@/lib/i18n'

const PromptEditor = lazy(() =>
  import('@/components/prompt-editor/prompt-editor').then((m) => ({
    default: m.PromptEditor,
  })),
)

interface ExpandedEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  value: string
  onChange: (value: string) => void
  bundleNames?: Array<EditorBundle>
  partsTokens?: boolean
}

/** Focus the CodeMirror editor inside `root` with the cursor at the end. */
async function focusEditorAtEnd(root: HTMLElement) {
  const dom = root.querySelector<HTMLElement>('.cm-editor')
  if (!dom) return
  const { EditorView } = await import('@codemirror/view')
  const view = EditorView.findFromDOM(dom)
  if (!view) return
  view.focus()
  view.dispatch({ selection: { anchor: view.state.doc.length } })
}

export function ExpandedEditorDialog({
  open,
  onOpenChange,
  title,
  value,
  onChange,
  bundleNames,
  partsTokens,
}: ExpandedEditorDialogProps) {
  const { t } = useTranslation()
  const { openSearch } = useTagSearch()
  const [tagGalleryOpen, setTagGalleryOpen] = useState(false)
  const [contentEl, setContentEl] = useState<HTMLElement | null>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={setContentEl}
        className="flex flex-col max-w-[calc(100%-2rem)] w-[90vw] h-[85vh] sm:max-w-[90vw] max-sm:inset-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:top-0 max-sm:left-0 max-sm:w-full max-sm:h-full max-sm:max-w-full max-sm:rounded-none"
      >
        <DialogHeader className="pr-8">
          <div className="flex items-center gap-2">
            <DialogTitle className="min-w-0 flex-1 truncate">
              {title}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => openSearch({ container: contentEl })}
              title={t('tagAssist.openSearch')}
              data-tag-search-open
            >
              <HugeiconsIcon icon={Search01Icon} className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setTagGalleryOpen(true)}
              title={t('tagGallery.panelTitle')}
            >
              <HugeiconsIcon icon={BookmarkCheck01Icon} className="size-4" />
            </Button>
          </div>
        </DialogHeader>
        <div
          data-expanded-editor-body
          className="flex-1 min-h-0 overflow-hidden cursor-text [&>div:first-child]:h-full [&_.cm-editor]:!h-full [&_.cm-scroller]:!h-full [&_.cm-content]:!min-h-full"
          onMouseDown={(e) => {
            // Clicks outside the editor surface (padding, gaps) focus it too
            if ((e.target as HTMLElement).closest('.cm-editor')) return
            e.preventDefault()
            void focusEditorAtEnd(e.currentTarget)
          }}
        >
          <Suspense
            fallback={
              <Textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="font-mono text-base h-full resize-none"
              />
            }
          >
            <PromptEditor
              value={value}
              onChange={onChange}
              minHeight="100%"
              bundleNames={bundleNames}
              partsTokens={partsTokens}
            />
          </Suspense>
        </div>
        <TagGalleryDialog
          open={tagGalleryOpen}
          onOpenChange={setTagGalleryOpen}
          onInsertTag={(tag) => onChange(appendTag(value, tag))}
          container={contentEl}
        />
      </DialogContent>
    </Dialog>
  )
}
