import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  getTournamentState,
  getNextPair,
  recordMatch,
  undoLastMatch,
  resetTournament,
} from '@/server/functions/tournament'

type MatchResult = 'left' | 'right' | 'both_win' | 'both_lose'

interface PairImage {
  id: number
  thumbnailPath: string | null
  filePath: string
  tournamentWins: number | null
  tournamentLosses: number | null
}

interface TournamentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectSceneId: number
  sceneName: string
}

function winRate(wins: number, losses: number): string {
  const total = wins + losses
  if (total === 0) return '-'
  return `${Math.round((wins / total) * 100)}%`
}

function imgSrc(img: PairImage, type: 'thumb' | 'full') {
  if (type === 'thumb' && img.thumbnailPath) {
    return `/api/thumbnails/${img.thumbnailPath.replace('data/thumbnails/', '')}`
  }
  return `/api/images/${img.filePath.replace('data/images/', '')}`
}

export function TournamentDialog({
  open,
  onOpenChange,
  projectSceneId,
  sceneName,
}: TournamentDialogProps) {
  const [pair, setPair] = useState<{ image1: PairImage; image2: PairImage } | null>(null)
  const [matchCount, setMatchCount] = useState(0)
  const [totalImages, setTotalImages] = useState(0)
  const [seenImages, setSeenImages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [transitioning, setTransitioning] = useState(false)

  const loadPair = useCallback(async () => {
    try {
      const [nextPair, state] = await Promise.all([
        getNextPair({ data: projectSceneId }),
        getTournamentState({ data: projectSceneId }),
      ])
      setPair(nextPair)
      setMatchCount(state.matchCount)
      setTotalImages(state.images.length)

      // Count images that have appeared in at least one match
      const appearedIds = new Set<number>()
      // We can approximate from W/L: if wins+losses > 0, the image has appeared
      for (const img of state.images) {
        if ((img.tournamentWins ?? 0) + (img.tournamentLosses ?? 0) > 0) {
          appearedIds.add(img.id)
        }
      }
      setSeenImages(appearedIds.size)
    } catch {
      toast.error('Failed to load tournament pair')
    }
    setLoading(false)
  }, [projectSceneId])

  useEffect(() => {
    if (open) {
      setLoading(true)
      loadPair()
    }
  }, [open, loadPair])

  const handleResult = useCallback(
    async (result: MatchResult) => {
      if (!pair || transitioning) return
      setTransitioning(true)

      try {
        await recordMatch({
          data: {
            projectSceneId,
            image1Id: pair.image1.id,
            image2Id: pair.image2.id,
            result,
          },
        })

        // Update local W/L for display continuity
        const newPair = { ...pair }
        if (result === 'left') {
          newPair.image1 = { ...pair.image1, tournamentWins: (pair.image1.tournamentWins ?? 0) + 1 }
          newPair.image2 = { ...pair.image2, tournamentLosses: (pair.image2.tournamentLosses ?? 0) + 1 }
        } else if (result === 'right') {
          newPair.image1 = { ...pair.image1, tournamentLosses: (pair.image1.tournamentLosses ?? 0) + 1 }
          newPair.image2 = { ...pair.image2, tournamentWins: (pair.image2.tournamentWins ?? 0) + 1 }
        } else if (result === 'both_win') {
          newPair.image1 = { ...pair.image1, tournamentWins: (pair.image1.tournamentWins ?? 0) + 1 }
          newPair.image2 = { ...pair.image2, tournamentWins: (pair.image2.tournamentWins ?? 0) + 1 }
        } else {
          newPair.image1 = { ...pair.image1, tournamentLosses: (pair.image1.tournamentLosses ?? 0) + 1 }
          newPair.image2 = { ...pair.image2, tournamentLosses: (pair.image2.tournamentLosses ?? 0) + 1 }
        }

        setMatchCount((c) => c + 1)
        await loadPair()
      } catch {
        toast.error('Failed to record match')
      }
      setTransitioning(false)
    },
    [pair, transitioning, projectSceneId, loadPair],
  )

  const handleUndo = useCallback(async () => {
    if (transitioning) return
    setTransitioning(true)
    try {
      const result = await undoLastMatch({ data: projectSceneId })
      if (!result.undone) {
        toast.info('Nothing to undo')
      } else {
        setMatchCount((c) => Math.max(0, c - 1))
        await loadPair()
        toast.success('Last match undone')
      }
    } catch {
      toast.error('Failed to undo')
    }
    setTransitioning(false)
  }, [transitioning, projectSceneId, loadPair])

  const handleReset = useCallback(async () => {
    if (transitioning) return
    if (!confirm('Reset all tournament data for this scene?')) return
    setTransitioning(true)
    try {
      await resetTournament({ data: projectSceneId })
      setMatchCount(0)
      setSeenImages(0)
      await loadPair()
      toast.success('Tournament reset')
    } catch {
      toast.error('Failed to reset')
    }
    setTransitioning(false)
  }, [transitioning, projectSceneId, loadPair])

  // Keyboard shortcuts
  useEffect(() => {
    if (!open || !pair) return

    function handleKey(e: KeyboardEvent) {
      // Ignore if focus is on an input/button
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        handleUndo()
        return
      }

      switch (e.key) {
        case 'ArrowLeft':
        case '1':
          e.preventDefault()
          handleResult('left')
          break
        case 'ArrowRight':
        case '2':
          e.preventDefault()
          handleResult('right')
          break
        case 'ArrowUp':
        case '3':
          e.preventDefault()
          handleResult('both_win')
          break
        case 'ArrowDown':
        case '4':
          e.preventDefault()
          handleResult('both_lose')
          break
        case 'Escape':
          e.preventDefault()
          onOpenChange(false)
          break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, pair, handleResult, handleUndo, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <header className="h-12 border-b border-border flex items-center px-3 shrink-0 gap-3">
        <Button variant="ghost" size="sm" onClick={handleUndo} disabled={matchCount === 0 || transitioning}>
          Undo
        </Button>
        <div className="flex-1 text-center min-w-0">
          <span className="text-sm font-semibold truncate">Tournament: {sceneName}</span>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {seenImages}/{totalImages} seen &middot; {matchCount} matches
        </span>
        <Button variant="ghost" size="sm" onClick={handleReset} disabled={matchCount === 0 || transitioning}>
          Reset
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}>
          &times;
        </Button>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : !pair ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Need at least 2 images to start a tournament.
          </div>
        ) : (
          <>
            {/* Image comparison area — uses calc to fill between header (h-12) and footer (~56px) */}
            <div className="flex-1 flex flex-col md:flex-row items-stretch gap-2 p-3 min-h-0 overflow-hidden">
              {/* Image 1 (Left) */}
              <div
                className="flex-1 flex flex-col items-center min-h-0 min-w-0 cursor-pointer group"
                onClick={() => !transitioning && handleResult('left')}
              >
                <div className="relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
                  <img
                    src={imgSrc(pair.image1, 'full')}
                    alt=""
                    className="max-w-full max-h-full object-contain rounded-lg"
                  />
                  <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity bg-green-500/10 border-2 border-transparent group-hover:border-green-500/50 pointer-events-none" />
                </div>
                <div className="text-sm text-muted-foreground text-center py-1 shrink-0">
                  <span className="font-medium text-foreground">
                    {pair.image1.tournamentWins ?? 0}W - {pair.image1.tournamentLosses ?? 0}L
                  </span>
                  {' '}
                  ({winRate(pair.image1.tournamentWins ?? 0, pair.image1.tournamentLosses ?? 0)})
                </div>
              </div>

              {/* VS divider */}
              <div className="flex items-center justify-center shrink-0">
                <span className="text-lg font-bold text-muted-foreground select-none">VS</span>
              </div>

              {/* Image 2 (Right) */}
              <div
                className="flex-1 flex flex-col items-center min-h-0 min-w-0 cursor-pointer group"
                onClick={() => !transitioning && handleResult('right')}
              >
                <div className="relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
                  <img
                    src={imgSrc(pair.image2, 'full')}
                    alt=""
                    className="max-w-full max-h-full object-contain rounded-lg"
                  />
                  <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity bg-green-500/10 border-2 border-transparent group-hover:border-green-500/50 pointer-events-none" />
                </div>
                <div className="text-sm text-muted-foreground text-center py-1 shrink-0">
                  <span className="font-medium text-foreground">
                    {pair.image2.tournamentWins ?? 0}W - {pair.image2.tournamentLosses ?? 0}L
                  </span>
                  {' '}
                  ({winRate(pair.image2.tournamentWins ?? 0, pair.image2.tournamentLosses ?? 0)})
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="border-t border-border px-4 py-2.5 flex items-center justify-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResult('left')}
                disabled={transitioning}
                className="min-w-[100px]"
              >
                &larr; Left Win
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResult('both_win')}
                disabled={transitioning}
                className="min-w-[100px]"
              >
                &uarr; Both Win
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResult('both_lose')}
                disabled={transitioning}
                className="min-w-[100px]"
              >
                &darr; Both Lose
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResult('right')}
                disabled={transitioning}
                className="min-w-[100px]"
              >
                Right Win &rarr;
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
