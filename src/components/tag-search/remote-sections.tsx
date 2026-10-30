import { useEffect, useState } from 'react'
import type { RatingCounts, RemoteKind } from '@/lib/tag-remote'
import type { RemoteResult } from '@/server/functions/tag-assist'
import { hasAnyCount } from '@/lib/tag-remote'
import {
  isDanbooruUnreachable,
  loadRemote,
} from '@/components/prompt-editor/tag-info-client'
import { useTranslation } from '@/lib/i18n'
import { formatCount, tagDisplayName } from '@/lib/tag-query'

const RATING_COLORS: Record<keyof RatingCounts, string> = {
  g: 'oklch(0.75 0.14 150)',
  s: 'oklch(0.82 0.13 95)',
  q: 'oklch(0.75 0.14 55)',
  e: 'oklch(0.68 0.2 25)',
}

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ok'; result: Extract<RemoteResult, { ok: true }> }

function useRemote(name: string, kind: RemoteKind) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    void loadRemote(name, kind, attempt > 0).then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ok', result: res } : { status: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [name, kind, attempt])
  return { state, retry: () => setAttempt((n) => n + 1) }
}

function RemoteSection({
  name,
  kind,
  label,
  onPick,
}: {
  name: string
  kind: RemoteKind
  label: string
  onPick: (tag: string) => void
}) {
  const { t } = useTranslation()
  const { state, retry } = useRemote(name, kind)

  if (state.status === 'ok') {
    const r = state.result
    if (r.kind === 'ratings') {
      return (
        <div data-tag-section="ratings" data-remote-state="ok">
          <div className="text-muted-foreground">{label}</div>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {(['g', 's', 'q', 'e'] as const).map((k) => (
              <div
                key={k}
                className="flex flex-col items-center rounded-md border py-0.5"
                title={r.ratings[k]?.toLocaleString()}
              >
                <span
                  className="text-[9px]"
                  style={{ color: RATING_COLORS[k] }}
                >
                  {t(`tagAssist.rating.${k}`)}
                </span>
                <span className="tabular-nums">
                  {r.ratings[k] === null ? '–' : formatCount(r.ratings[k])}
                </span>
              </div>
            ))}
          </div>
          {!hasAnyCount(r.ratings) && (
            <div className="mt-1 text-muted-foreground">
              {t('tagAssist.ratingUnavailable')}
            </div>
          )}
        </div>
      )
    }
    if (r.tags.length === 0) return null
    return (
      <div
        className="flex flex-wrap items-center gap-1"
        data-tag-section={kind}
        data-remote-state="ok"
      >
        <span className="text-muted-foreground">{label}</span>
        {r.tags.map((x) => (
          <button
            key={x.name}
            type="button"
            onClick={() => onPick(x.name)}
            className="rounded-full border px-1.5 text-[10px] hover:bg-accent"
          >
            {tagDisplayName(x.name)}
          </button>
        ))}
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div
        className="flex flex-wrap items-center gap-x-2"
        data-tag-section={kind}
        data-remote-state="error"
      >
        <span className="text-muted-foreground">
          {label}: {t('tagAssist.remoteFailed')}
        </span>
        <button
          type="button"
          onClick={retry}
          className="text-[10px] text-primary hover:underline"
        >
          {t('tagAssist.retry')}
        </button>
        {isDanbooruUnreachable() && (
          <span className="w-full text-muted-foreground">
            {t('tagAssist.remoteUnreachable')}
          </span>
        )}
      </div>
    )
  }

  return (
    <div data-tag-section={kind} data-remote-state="loading">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 h-3.5 animate-pulse rounded-full bg-muted" />
    </div>
  )
}

/** Danbooru-backed sections (Recommended, Used together, Rating counts). */
export function RemoteSections({
  name,
  onPick,
}: {
  name: string
  onPick: (tag: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1" data-tag-remote-sections>
      <RemoteSection
        name={name}
        kind="related"
        label={t('tagAssist.recommended')}
        onPick={onPick}
      />
      <RemoteSection
        name={name}
        kind="together"
        label={t('tagAssist.usedTogether')}
        onPick={onPick}
      />
      <RemoteSection
        name={name}
        kind="ratings"
        label={t('tagAssist.ratingCounts')}
        onPick={onPick}
      />
    </div>
  )
}
