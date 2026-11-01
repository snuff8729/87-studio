import { Suspense, lazy, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { BundleDraftSource } from '@/lib/save-as-bundle'
import type { BundleKind } from '@/lib/wildcard'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Segmented } from '@/components/common/segmented'
import { ExpandedEditorDialog } from '@/components/prompt-editor/expanded-editor-dialog'
import { PromptEditorHeader } from '@/components/prompt-editor/prompt-editor-header'
import { TagGalleryDialog } from '@/components/tag-gallery/tag-gallery-dialog'
import { appendTag } from '@/components/tag-gallery/use-tag-gallery'
import { createBundleFromImage } from '@/server/functions/bundles'
import { useBundleNames } from '@/lib/use-bundles'
import { useTranslation } from '@/lib/i18n'
import {
  availableStyleSettings,
  isDuplicateBundleName,
  pickStyleParams,
} from '@/lib/save-as-bundle'

const PromptEditor = lazy(() =>
  import('@/components/prompt-editor/prompt-editor').then((m) => ({
    default: m.PromptEditor,
  })),
)

function LazyPromptEditor(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: string
}) {
  return (
    <Suspense
      fallback={
        <Textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          className="font-mono text-base min-h-[120px]"
        />
      }
    >
      <PromptEditor {...props} />
    </Suspense>
  )
}

/** Where the bundle's image comes from */
export type BundleImageSource =
  /** A gallery image: becomes the thumbnail + linked image */
  | { type: 'gallery'; imageId: number }
  /** An uploaded file (not in the DB): resolves to base64 for the preview */
  | { type: 'upload'; getBase64: () => Promise<string> }

function valueText(
  key: ReturnType<typeof availableStyleSettings>[number],
  p: BundleDraftSource['params'],
): string {
  switch (key) {
    case 'size':
      return `${p.width ?? '—'} × ${p.height ?? '—'}`
    case 'steps':
      return String(p.steps)
    case 'scale':
      return String(p.scale)
    case 'cfgRescale':
      return String(p.cfgRescale)
    case 'sampler':
      return [p.sampler, p.scheduler].filter(Boolean).join(' · ')
  }
}

export function SaveAsBundleDialog({
  open,
  onOpenChange,
  source,
  image,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: BundleDraftSource
  image: BundleImageSource
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <SaveAsBundleBody
          source={source}
          image={image}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  )
}

function SaveAsBundleBody({
  source,
  image,
  onClose,
}: {
  source: BundleDraftSource
  image: BundleImageSource
  onClose: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const existing = useBundleNames()
  const available = useMemo(
    () => availableStyleSettings(source.params),
    [source.params],
  )

  const [kind, setKind] = useState<BundleKind>('style')
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState(source.prompt)
  const [negative, setNegative] = useState(source.negative)
  const [checked, setChecked] = useState(() => new Set(available))
  const [serverDuplicate, setServerDuplicate] = useState(false)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [contentEl, setContentEl] = useState<HTMLElement | null>(null)
  const [expand, setExpand] = useState<'prompt' | 'negative' | null>(null)
  const [tagTarget, setTagTarget] = useState<'prompt' | 'negative' | null>(null)

  const trimmed = name.trim()
  const duplicate =
    serverDuplicate ||
    isDuplicateBundleName(
      trimmed,
      existing.map((b) => b.name),
    )
  const nameError = duplicate
    ? t('bundles.saveNameDuplicate')
    : touched && !trimmed
      ? t('bundles.saveNameRequired')
      : null
  const isStyle = kind === 'style'

  async function handleSave() {
    setTouched(true)
    if (!trimmed || duplicate) return
    setSaving(true)
    try {
      const result = await createBundleFromImage({
        data: {
          kind,
          name: trimmed,
          content: prompt,
          negative: isStyle ? negative : undefined,
          styleParams: isStyle
            ? pickStyleParams(source.params, [...checked])
            : undefined,
          ...(image.type === 'gallery'
            ? { imageId: image.imageId }
            : { imageData: await image.getBase64() }),
        },
      })
      void queryClient.invalidateQueries({ queryKey: ['bundleNames'] })
      toast.success(t('bundles.saveCreated', { name: result.name }), {
        action: {
          label: t('bundles.saveOpen'),
          onClick: () =>
            navigate({
              to: '/bundles',
              search: { bundle: result.name, imageDetail: undefined },
            }),
        },
      })
      onClose()
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('DUPLICATE_BUNDLE_NAME')
      ) {
        setServerDuplicate(true)
      } else {
        toast.error(t('bundles.saveFailed'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogContent
        ref={setContentEl}
        data-save-as-bundle
        className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          contentEl?.querySelector<HTMLInputElement>('[data-save-name]')?.focus()
        }}
      >
        <DialogHeader className="px-4 pt-4 pb-3 pr-10">
          <DialogTitle>{t('bundles.saveAsBundle')}</DialogTitle>
          <DialogDescription>
            {t('bundles.saveAsBundleDesc')}
            {image.type === 'gallery' && ` ${t('bundles.saveImageHint')}`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          <Segmented
            label={t('bundles.kind')}
            value={kind}
            onChange={setKind}
            options={[
              { value: 'text', label: t('bundles.kindText') },
              { value: 'style', label: t('bundles.kindStyle') },
            ]}
          />

          <div className="space-y-1.5">
            <label
              htmlFor="save-bundle-name"
              className="text-sm uppercase tracking-wider text-muted-foreground"
            >
              {t('bundles.saveName')}
            </label>
            <Input
              id="save-bundle-name"
              data-save-name
              value={name}
              placeholder={t('bundles.saveNamePlaceholder')}
              aria-invalid={!!nameError}
              onChange={(e) => {
                setName(e.target.value)
                setServerDuplicate(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave()
              }}
            />
            {nameError && (
              <p
                className="text-xs text-destructive"
                data-save-name-error
                role="alert"
              >
                {nameError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <PromptEditorHeader
              label={t('bundles.bundleContent')}
              uppercase
              onExpand={() => setExpand('prompt')}
              onOpenTagGallery={() => setTagTarget('prompt')}
            />
            <LazyPromptEditor
              value={prompt}
              onChange={setPrompt}
              placeholder={t('bundles.contentPlaceholder')}
              minHeight="140px"
            />
          </div>

          {isStyle && (
            <>
              <div className="space-y-1.5" data-save-negative>
                <PromptEditorHeader
                  label={t('bundles.negative')}
                  uppercase
                  onExpand={() => setExpand('negative')}
                  onOpenTagGallery={() => setTagTarget('negative')}
                />
                <LazyPromptEditor
                  value={negative}
                  onChange={setNegative}
                  placeholder={t('bundles.negativePlaceholder')}
                  minHeight="90px"
                />
              </div>

              <div className="space-y-1" data-save-settings>
                <span className="text-sm uppercase tracking-wider text-muted-foreground">
                  {t('bundles.styleSettings')}
                </span>
                {available.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t('bundles.saveSettingsNone')}
                  </p>
                ) : (
                  <div>
                    {available.map((key) => (
                      <label
                        key={key}
                        className="flex cursor-pointer items-baseline gap-2.5 py-1"
                      >
                        <Checkbox
                          checked={checked.has(key)}
                          onCheckedChange={(v) =>
                            setChecked((cur) => {
                              const next = new Set(cur)
                              if (v === true) next.add(key)
                              else next.delete(key)
                              return next
                            })
                          }
                          className="shrink-0 self-center"
                          data-save-setting={key}
                        />
                        <span className="text-sm">
                          {t(`metadataImport.${key}` as any)}
                        </span>
                        <span className="min-w-0 break-all font-mono text-xs text-muted-foreground">
                          {valueText(key, source.params)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t px-4 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            data-save-submit
            onClick={() => void handleSave()}
            disabled={saving || duplicate}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>

        <TagGalleryDialog
          open={tagTarget !== null}
          onOpenChange={(o) => {
            if (!o) setTagTarget(null)
          }}
          container={contentEl}
          onInsertTag={(tag) => {
            if (tagTarget === 'negative') setNegative((v) => appendTag(v, tag))
            else setPrompt((v) => appendTag(v, tag))
          }}
        />
      </DialogContent>
      <ExpandedEditorDialog
        open={expand !== null}
        onOpenChange={(o) => {
          if (!o) setExpand(null)
        }}
        title={
          expand === 'negative' ? t('bundles.negative') : t('bundles.bundleContent')
        }
        value={expand === 'negative' ? negative : prompt}
        onChange={expand === 'negative' ? setNegative : setPrompt}
      />
    </>
  )
}
