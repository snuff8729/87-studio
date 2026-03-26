import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertCircleIcon,
  Delete02Icon,
  Image02Icon,
} from '@hugeicons/core-free-icons'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { useTranslation } from '@/lib/i18n'
import {
  deleteReference,
  listReferences,
  updateReference,
  uploadReference,
} from '@/server/functions/references'

type ReferenceMode = 'none' | 'vibe' | 'precise'

interface ReferenceImage {
  id: number
  projectId: number
  type: string
  filePath: string
  thumbnailPath: string | null
  processedPath: string | null
  encodedVibePath: string | null
  encodedModel: string | null
  strength: number
  informationExtracted: number
  fidelity: number
  referenceMode: string
  sortOrder: number
  enabled: number
  createdAt: string | null
  updatedAt: string | null
}

interface ReferencePanelProps {
  projectId: number | null
  referenceMode: ReferenceMode
  currentModel: string
  onReferenceModeChange: (mode: ReferenceMode) => void
}

export function ReferencePanel({
  projectId,
  referenceMode,
  currentModel,
  onReferenceModeChange,
}: ReferencePanelProps) {
  const { t } = useTranslation()
  const [references, setReferences] = useState<Array<ReferenceImage>>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isV45 = currentModel.includes('4-5')

  // Load references
  const loadReferences = useCallback(async () => {
    try {
      const refs = await listReferences({ data: projectId })
      setReferences(refs as Array<ReferenceImage>)
    } catch {
      /* ignore */
    }
  }, [projectId])

  useEffect(() => {
    loadReferences()
  }, [loadReferences])

  const filteredRefs = references.filter((r) => r.type === referenceMode)

  // ── Upload ──
  async function handleUpload(file: File) {
    if (referenceMode === 'none') return

    // Vibe limit check
    if (referenceMode === 'vibe') {
      const vibeCount = references.filter((r) => r.type === 'vibe').length
      if (vibeCount >= 16) {
        toast.error(t('reference.maxVibes'))
        return
      }
    }

    setUploading(true)
    try {
      const buffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(buffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          '',
        ),
      )
      await uploadReference({
        data: { projectId, type: referenceMode, imageBase64: base64 },
      })
      await loadReferences()
    } catch {
      toast.error(t('reference.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) handleUpload(file)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  // ── Update ──
  async function handleUpdate(id: number, updates: Record<string, unknown>) {
    try {
      await updateReference({ data: { id, ...updates } })
      await loadReferences()
    } catch {
      toast.error(t('reference.updateFailed'))
    }
  }

  // ── Delete ──
  async function handleDelete(id: number) {
    try {
      await deleteReference({ data: id })
      await loadReferences()
    } catch {
      toast.error(t('reference.deleteFailed'))
    }
  }

  return (
    <div className="p-3 border-t border-border space-y-2.5">
      <Label className="text-sm text-muted-foreground uppercase tracking-wider">
        {t('reference.title')}
      </Label>

      {/* 3-way toggle */}
      <div className="flex items-center bg-muted rounded-lg p-[3px] h-8 min-w-0">
        {(['none', 'vibe', 'precise'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => onReferenceModeChange(mode)}
            className={`flex-1 h-full rounded-md text-xs font-medium transition-all whitespace-nowrap px-1 ${
              referenceMode === mode
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {mode === 'none'
              ? t('reference.none')
              : mode === 'vibe'
                ? t('reference.vibeTransfer')
                : t('reference.preciseReference')}
          </button>
        ))}
      </div>

      {/* V4.5 warning for precise */}
      {referenceMode === 'precise' && !isV45 && (
        <div className="flex items-center gap-1.5 text-xs text-amber-500 bg-amber-500/10 rounded-md px-2 py-1.5">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5 shrink-0" />
          {t('reference.v45Only')}
        </div>
      )}

      {/* Reference image list + upload */}
      {referenceMode !== 'none' && (
        <div className="space-y-2">
          {/* Images */}
          {filteredRefs.map((ref) => (
            <ReferenceImageCard
              key={ref.id}
              ref_={ref}
              referenceMode={referenceMode}
              currentModel={currentModel}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}

          {/* Upload area */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className="border border-dashed border-border rounded-lg p-3 flex flex-col items-center gap-1.5 cursor-pointer hover:border-muted-foreground/50 hover:bg-muted/30 transition-colors"
          >
            {uploading ? (
              <span className="text-xs text-muted-foreground">
                {t('common.processing')}
              </span>
            ) : (
              <>
                <HugeiconsIcon
                  icon={Image02Icon}
                  className="size-5 text-muted-foreground"
                />
                <span className="text-xs text-muted-foreground">
                  {t('reference.dropOrClick')}
                </span>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      )}
    </div>
  )
}

// ── Individual reference image card ──

function ReferenceImageCard({
  ref_,
  referenceMode,
  currentModel,
  onUpdate,
  onDelete,
}: {
  ref_: ReferenceImage
  referenceMode: ReferenceMode
  currentModel: string
  onUpdate: (id: number, updates: Record<string, unknown>) => void
  onDelete: (id: number) => void
}) {
  const { t } = useTranslation()

  const thumbnailUrl = ref_.thumbnailPath
    ? `/api/references/${ref_.thumbnailPath.replace('data/references/', '')}`
    : undefined

  const vibeNeedsReencode =
    referenceMode === 'vibe' &&
    ref_.encodedVibePath &&
    ref_.encodedModel !== currentModel

  const vibeNotEncoded = referenceMode === 'vibe' && !ref_.encodedVibePath

  return (
    <div
      className={`rounded-lg border border-border p-2 space-y-2 ${ref_.enabled ? '' : 'opacity-50'}`}
    >
      <div className="flex items-start gap-2">
        {/* Thumbnail */}
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className="size-14 rounded-md object-cover shrink-0 bg-muted"
          />
        ) : (
          <div className="size-14 rounded-md bg-muted shrink-0 flex items-center justify-center">
            <HugeiconsIcon
              icon={Image02Icon}
              className="size-5 text-muted-foreground"
            />
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-1">
          {/* Status badges */}
          {vibeNeedsReencode && (
            <span className="text-[10px] text-amber-500 leading-tight block">
              {t('reference.encodingMismatch')}
            </span>
          )}
          {vibeNotEncoded && (
            <span className="text-[10px] text-muted-foreground leading-tight block">
              {t('reference.encodingPending')}
            </span>
          )}

          {/* Precise: mode selector */}
          {referenceMode === 'precise' && (
            <Select
              value={ref_.referenceMode}
              onValueChange={(v) => onUpdate(ref_.id, { referenceMode: v })}
            >
              <SelectTrigger className="h-6 text-xs w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="character&style">
                  {t('reference.modeCharacterStyle')}
                </SelectItem>
                <SelectItem value="character">
                  {t('reference.modeCharacter')}
                </SelectItem>
                <SelectItem value="style">
                  {t('reference.modeStyle')}
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onUpdate(ref_.id, { enabled: ref_.enabled ? 0 : 1 })}
            title={
              ref_.enabled ? t('reference.enabled') : t('reference.disabled')
            }
            className={
              ref_.enabled ? 'text-foreground' : 'text-muted-foreground'
            }
          >
            <span className="text-xs">{ref_.enabled ? 'ON' : 'OFF'}</span>
          </Button>
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
              </Button>
            }
            title={t('reference.deleteConfirm')}
            description={t('reference.deleteDesc')}
            onConfirm={() => onDelete(ref_.id)}
          />
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-1.5 px-0.5">
        {/* Strength (both modes) */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {t('reference.strength')}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {ref_.strength.toFixed(2)}
            </span>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[ref_.strength]}
            onValueChange={([v]) =>
              onUpdate(ref_.id, { strength: Math.round(v * 100) / 100 })
            }
            className="h-4"
          />
        </div>

        {/* Vibe: Information Extracted */}
        {referenceMode === 'vibe' && (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {t('reference.informationExtracted')}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {ref_.informationExtracted.toFixed(2)}
              </span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[ref_.informationExtracted]}
              onValueChange={([v]) =>
                onUpdate(ref_.id, {
                  informationExtracted: Math.round(v * 100) / 100,
                })
              }
              className="h-4"
            />
          </div>
        )}

        {/* Precise: Fidelity */}
        {referenceMode === 'precise' && (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {t('reference.fidelity')}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {ref_.fidelity.toFixed(2)}
              </span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[ref_.fidelity]}
              onValueChange={([v]) =>
                onUpdate(ref_.id, { fidelity: Math.round(v * 100) / 100 })
              }
              className="h-4"
            />
          </div>
        )}
      </div>
    </div>
  )
}
