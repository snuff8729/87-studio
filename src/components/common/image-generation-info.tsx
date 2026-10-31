import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { NAIMetadata } from '@/lib/nai-metadata'
import { getUcPresetLabel, parseNAIMetadata } from '@/lib/nai-metadata'
import { CharacterPositionsMeta } from '@/components/common/character-positions-meta'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { getImageLibraryInfo } from '@/server/functions/library'
import { useTranslation } from '@/lib/i18n'

/** Linked library parts (character / outfit / coordination / axis values). Renders nothing when empty. */
export function ImageLinkedParts({ imageId }: { imageId: number }) {
  const { t } = useTranslation()
  const { data } = useQuery({
    queryKey: ['image-library-info', imageId],
    queryFn: () => getImageLibraryInfo({ data: { imageId } }),
  })
  if (!data) return null
  const { characters, items, presets, axes, bundles } = data
  if (
    !characters.length &&
    !items.length &&
    !presets.length &&
    !axes.length &&
    !bundles.length
  )
    return null

  const chip = (
    key: string,
    label: string,
    tab: 'characters' | 'outfits' | 'presets',
    id: number,
    projectId?: number | null,
  ) => (
    <Badge key={key} variant="secondary" asChild>
      <Link
        to="/characters"
        search={{
          tab,
          id,
          projectId: projectId ?? undefined,
          imageDetail: undefined,
        }}
        data-linked-part={`${tab}:${id}`}
      >
        {label}
      </Link>
    </Badge>
  )
  const group = (label: string, children: Array<ReactNode>) =>
    children.length > 0 && (
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1">{label}</span>
        {children}
      </div>
    )

  return (
    <>
      <div className="mb-4 space-y-1.5" data-linked-parts>
        <label className="text-sm text-muted-foreground block">
          {t('imageDetail.linkedParts')}
        </label>
        {group(
          t('imageDetail.partCharacter'),
          characters.map((c) =>
            chip(`c${c.id}`, c.name, 'characters', c.id, c.projectId),
          ),
        )}
        {group(
          t('imageDetail.partOutfit'),
          items.map((c) =>
            chip(`i${c.id}`, c.name, 'outfits', c.id, c.projectId),
          ),
        )}
        {group(
          t('imageDetail.partPreset'),
          presets.map((c) => chip(`p${c.id}`, c.name, 'presets', c.id)),
        )}
        {group(
          t('imageDetail.partBundle'),
          bundles.map((b) => (
            <Badge key={`b${b.id}`} variant="secondary" asChild>
              <Link
                to="/bundles"
                search={{ bundle: b.name, imageDetail: undefined }}
                data-linked-part={`bundles:${b.id}`}
              >
                {b.name}
              </Link>
            </Badge>
          )),
        )}
        {axes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {axes.map((a, i) => (
              <Badge key={i} variant="outline">
                {a.axisName}: {a.valueName}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <Separator className="mb-4" />
    </>
  )
}

interface DetailLike {
  seed: number | null
  createdAt: string | null
  /** JSON string (or already parsed object) of the stored generation metadata */
  metadata: unknown
}

function parseStored(m: unknown): any {
  if (!m) return null
  if (typeof m !== 'string') return m
  try {
    return JSON.parse(m)
  } catch {
    return null
  }
}

/** Single collapsible "NAI metadata" section: PNG parsed lazily, stored (DB) metadata as fallback/supplement. Remount per image (key). */
export function ImageGenerationInfo({
  detail,
  imageSrc,
}: {
  detail: DetailLike
  imageSrc: string
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [naiMeta, setNaiMeta] = useState<NAIMetadata | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const meta = parseStored(detail.metadata)

  async function toggle() {
    const willExpand = !expanded
    setExpanded(willExpand)
    if (willExpand && !loaded && imageSrc) {
      setLoading(true)
      try {
        const resp = await fetch(imageSrc)
        const buffer = await resp.arrayBuffer()
        setNaiMeta(await parseNAIMetadata(buffer))
      } catch {
        /* silently fail */
      } finally {
        setLoading(false)
        setLoaded(true)
      }
    }
  }

  const naiShowsRefs = !!(
    naiMeta &&
    (naiMeta.hasVibeTransfer || naiMeta.hasCharacterReference)
  )

  return (
    <div className="mb-4" data-detail-nai>
      <button
        onClick={toggle}
        className="flex items-center justify-between w-full text-sm text-muted-foreground mb-2 hover:text-foreground transition-colors"
      >
        <span>{t('imageDetail.naiMetadata')}</span>
        <span className="text-xs">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="space-y-4 animate-in fade-in-0 slide-in-from-top-1 duration-150">
          {loading && (
            <div className="flex items-center gap-2 py-3">
              <div className="size-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">
                {t('imageDetail.parsing')}
              </span>
            </div>
          )}
          {naiMeta && <NaiMetadataView metadata={naiMeta} />}
          {loaded && !naiMeta && (
            <>
              <p className="text-xs text-muted-foreground">
                {t('imageDetail.noNaiMetadata')}
              </p>
              <StoredFallback detail={detail} />
            </>
          )}
          {loaded && (
            <>
              <div className="text-sm text-muted-foreground">
                {t('imageDetail.created')}:{' '}
                {detail.createdAt
                  ? new Date(detail.createdAt).toLocaleString()
                  : 'N/A'}
              </div>
              <CharacterPositionsMeta meta={meta} />
              {!naiShowsRefs && <StoredReferences meta={meta} />}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** DB-derived seed / parameters / prompts, shown only when the PNG has no NAI metadata */
function StoredFallback({ detail }: { detail: DetailLike }) {
  const { t } = useTranslation()
  const meta = parseStored(detail.metadata)
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        {t('imageDetail.seed')}: {detail.seed ?? 'N/A'}
      </div>
      {meta?.parameters && (
        <div className="text-sm space-y-0.5 text-muted-foreground">
          {meta.parameters.width && (
            <p>
              {t('imageDetail.size')}: {meta.parameters.width}x
              {meta.parameters.height}
            </p>
          )}
          {meta.parameters.steps && (
            <p>
              {t('imageDetail.steps')}: {meta.parameters.steps}
            </p>
          )}
          {meta.parameters.cfg_scale && (
            <p>
              {t('imageDetail.cfg')}: {meta.parameters.cfg_scale}
            </p>
          )}
          {meta.parameters.sampler && (
            <p>
              {t('imageDetail.sampler')}: {meta.parameters.sampler}
            </p>
          )}
        </div>
      )}
      {meta?.prompts?.generalPrompt && (
        <div>
          <label className="text-xs text-muted-foreground block mb-0.5">
            {t('imageDetail.generalPrompt')}
          </label>
          <p className="text-xs font-mono text-foreground/80 whitespace-pre-wrap bg-secondary/50 p-1.5 rounded-md max-h-28 overflow-y-auto">
            {meta.prompts.generalPrompt}
          </p>
        </div>
      )}
      {meta?.prompts?.negativePrompt && (
        <div>
          <label className="text-xs text-muted-foreground block mb-0.5">
            {t('imageDetail.negativePrompt')}
          </label>
          <p className="text-xs font-mono text-foreground/80 whitespace-pre-wrap bg-secondary/50 p-1.5 rounded-md max-h-20 overflow-y-auto">
            {meta.prompts.negativePrompt}
          </p>
        </div>
      )}
    </div>
  )
}

/** Vibe / precise reference strengths from stored metadata (when the PNG view has none) */
function StoredReferences({ meta }: { meta: any }) {
  const { t } = useTranslation()
  if (!meta?.referenceMode || meta.referenceMode === 'none' || !meta.references)
    return null
  const vibes: Array<{ strength: number; informationExtracted: number }> =
    meta.referenceMode === 'vibe' ? (meta.references.vibes ?? []) : []
  const precise: Array<{ strength: number; fidelity: number; mode: string }> =
    meta.referenceMode === 'precise' ? (meta.references.precise ?? []) : []
  if (!vibes.length && !precise.length) return null
  return (
    <div>
      <label className="text-sm text-muted-foreground mb-1.5 block">
        {t('imageDetail.references')}
      </label>
      <div className="text-sm space-y-1 bg-secondary/50 p-2 rounded-md">
        <p className="text-xs text-muted-foreground mb-1.5">
          {meta.referenceMode === 'vibe'
            ? t('reference.vibeTransfer')
            : t('reference.preciseReference')}
        </p>
        {vibes.map((v, i) => (
          <div key={i} className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            <span className="text-muted-foreground">
              Vibe {i + 1} {t('reference.strength')}
            </span>
            <span className="text-foreground/80 font-mono">
              {v.strength.toFixed(2)}
            </span>
            <span className="text-muted-foreground">
              Vibe {i + 1} {t('reference.informationExtracted')}
            </span>
            <span className="text-foreground/80 font-mono">
              {v.informationExtracted.toFixed(2)}
            </span>
          </div>
        ))}
        {precise.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            <span className="text-muted-foreground">
              Ref {i + 1} {t('reference.strength')}
            </span>
            <span className="text-foreground/80 font-mono">
              {r.strength.toFixed(2)}
            </span>
            <span className="text-muted-foreground">
              Ref {i + 1} {t('reference.fidelity')}
            </span>
            <span className="text-foreground/80 font-mono">
              {r.fidelity.toFixed(2)}
            </span>
            <span className="text-muted-foreground">
              Ref {i + 1} {t('reference.mode')}
            </span>
            <span className="text-foreground/80 font-mono">{r.mode}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Compact NAI Metadata viewer ──────────────────────────────────────────

function NaiMetadataView({ metadata }: { metadata: NAIMetadata }) {
  return (
    <div className="space-y-3">
      {metadata.source && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {metadata.source === 'text_chunk' ? 'tEXt Chunk' : 'Stealth Alpha'}
          </span>
        </div>
      )}

      {metadata.model && (
        <div>
          <label className="text-xs text-muted-foreground block mb-0.5">
            Model
          </label>
          <p className="text-sm font-mono text-foreground/80">
            {metadata.model}
          </p>
        </div>
      )}

      {metadata.prompt && (
        <div>
          <label className="text-xs text-muted-foreground block mb-0.5">
            Positive
          </label>
          <p className="text-xs font-mono text-foreground/80 whitespace-pre-wrap bg-secondary/50 p-1.5 rounded-md max-h-28 overflow-y-auto">
            {metadata.prompt}
          </p>
        </div>
      )}

      {metadata.negativePrompt && (
        <div>
          <label className="text-xs text-muted-foreground block mb-0.5">
            Negative
          </label>
          <p className="text-xs font-mono text-foreground/80 whitespace-pre-wrap bg-secondary/50 p-1.5 rounded-md max-h-20 overflow-y-auto">
            {metadata.negativePrompt}
          </p>
        </div>
      )}

      {/* V4 Characters */}
      {metadata.v4_prompt?.caption?.char_captions?.map((char, i) => {
        const negChar = metadata.v4_negative_prompt?.caption?.char_captions?.[i]
        return (
          <div key={i} className="space-y-1.5">
            <div>
              <label className="text-xs text-muted-foreground block mb-0.5">
                Character {i + 1}
              </label>
              <p className="text-xs font-mono text-foreground/80 whitespace-pre-wrap bg-secondary/50 p-1.5 rounded-md max-h-20 overflow-y-auto">
                {char.char_caption}
              </p>
            </div>
            {negChar?.char_caption && (
              <div>
                <label className="text-xs text-muted-foreground block mb-0.5">
                  Character {i + 1} Negative
                </label>
                <p className="text-xs font-mono text-foreground/80 whitespace-pre-wrap bg-secondary/50 p-1.5 rounded-md max-h-16 overflow-y-auto">
                  {negChar.char_caption}
                </p>
              </div>
            )}
          </div>
        )
      })}

      {/* Parameters grid */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          Parameters
        </label>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
          {metadata.width != null && metadata.height != null && (
            <NaiRow
              label="Size"
              value={`${metadata.width}x${metadata.height}`}
            />
          )}
          {metadata.steps != null && (
            <NaiRow label="Steps" value={metadata.steps} />
          )}
          {metadata.cfgScale != null && (
            <NaiRow label="CFG" value={metadata.cfgScale} />
          )}
          {metadata.cfgRescale != null && metadata.cfgRescale > 0 && (
            <NaiRow label="Rescale" value={metadata.cfgRescale} />
          )}
          {metadata.seed != null && (
            <NaiRow label="Seed" value={metadata.seed} />
          )}
          {metadata.sampler && (
            <NaiRow label="Sampler" value={metadata.sampler} />
          )}
          {metadata.scheduler && (
            <NaiRow label="Scheduler" value={metadata.scheduler} />
          )}
          {metadata.smea != null && (
            <NaiRow label="SMEA" value={metadata.smea ? 'On' : 'Off'} />
          )}
          {metadata.smeaDyn != null && (
            <NaiRow label="DYN" value={metadata.smeaDyn ? 'On' : 'Off'} />
          )}
          {metadata.variety != null && (
            <NaiRow label="Variety+" value={metadata.variety ? 'On' : 'Off'} />
          )}
          {metadata.qualityToggle != null && (
            <NaiRow
              label="Quality"
              value={metadata.qualityToggle ? 'On' : 'Off'}
            />
          )}
          {metadata.ucPreset != null && (
            <NaiRow label="UC" value={getUcPresetLabel(metadata.ucPreset)} />
          )}
        </div>
      </div>

      {/* Reference info */}
      {(metadata.hasVibeTransfer || metadata.hasCharacterReference) && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            References
          </label>
          <div className="text-xs space-y-0.5 text-foreground/80">
            {metadata.hasVibeTransfer &&
              metadata.vibeTransferInfo?.map((vt, i) => (
                <p key={`vt-${i}`}>
                  Vibe {i + 1}: str {vt.strength.toFixed(2)}, info{' '}
                  {vt.informationExtracted.toFixed(2)}
                </p>
              ))}
            {metadata.hasCharacterReference &&
              metadata.characterReferenceInfo?.map((cr, i) => (
                <p key={`cr-${i}`}>
                  CharRef {i + 1}: str {cr.strength.toFixed(2)}, info{' '}
                  {cr.informationExtracted.toFixed(2)}
                </p>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

function NaiRow({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground/80 font-mono">{value}</span>
    </>
  )
}
