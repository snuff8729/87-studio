import { useCallback, useState } from 'react'

export type GridSize = 'sm' | 'md' | 'lg'

const STORAGE_PREFIX = '87studio-grid-'

function getStored(key: string): GridSize {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + key)
    if (v === 'sm' || v === 'md' || v === 'lg') return v
  } catch {}
  return 'md'
}

export function useImageGridSize(key: string) {
  const [gridSize, setGridSizeState] = useState<GridSize>(() => getStored(key))

  const setGridSize = useCallback(
    (size: GridSize) => {
      setGridSizeState(size)
      try {
        localStorage.setItem(STORAGE_PREFIX + key, size)
      } catch {}
    },
    [key],
  )

  return { gridSize, setGridSize } as const
}
