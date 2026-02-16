// SD Studio JSON import parser
// Transforms SD Studio preset files into 87-Studio scene pack format

export interface SdStudioFile {
  name: string
  scenes: Record<string, SdScene>
  library?: Record<string, SdLibrary>
}

interface SdScene {
  name: string
  slots: SdAlternative[][]
  mains?: unknown[]
  [key: string]: unknown
}

interface SdAlternative {
  prompt: string
  enabled?: boolean
  id?: string
  characterPrompts?: unknown[]
}

interface SdLibrary {
  name: string
  pieces: SdPiece[]
}

interface SdPiece {
  name: string
  prompt: string
  multi?: boolean
}

// ─── Output types ────────────────────────────────────────────────────────────

export interface ParsedScenePack {
  name: string
  scenes: ParsedScene[]
  libraryPieces: string[]
}

export interface ParsedScene {
  name: string
  placeholders: Record<string, string>
  sortOrder: number
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

// <library_name.piece_name> refs in prompts
const LIB_REF_RE = /<([^.>]+)\.([^>]+)>/g

export function parseSdStudioFile(raw: unknown): ParsedScenePack {
  const file = raw as SdStudioFile
  if (!file.name || !file.scenes || typeof file.scenes !== 'object') {
    throw new Error('Invalid SD Studio file: missing name or scenes')
  }

  // Collect library pieces: namespace.piece → value
  const pieceValues = new Map<string, string>()
  if (file.library) {
    for (const [libKey, lib] of Object.entries(file.library)) {
      if (lib.pieces) {
        for (const piece of lib.pieces) {
          pieceValues.set(`${libKey}.${piece.name}`, piece.prompt ?? '')
        }
      }
    }
  }

  // Parse each scene
  const allScenes: ParsedScene[] = []
  const nameCount = new Map<string, number>()
  let sortOrder = 0

  for (const [_key, scene] of Object.entries(file.scenes)) {
    const sceneName = scene.name || _key
    const expanded = expandScene(sceneName, scene, pieceValues)

    for (const s of expanded) {
      // Deduplicate names
      const count = nameCount.get(s.name) ?? 0
      if (count > 0) {
        s.name = `${s.name} (${count + 1})`
      }
      nameCount.set(s.name.replace(/ \(\d+\)$/, ''), (nameCount.get(s.name.replace(/ \(\d+\)$/, '')) ?? 0) + 1)

      s.sortOrder = sortOrder++
      allScenes.push(s)
    }
  }

  return {
    name: file.name,
    scenes: allScenes,
    libraryPieces: [...new Set([...pieceValues.keys()].map((k) => k.split('.').pop()!))],
  }
}

function expandScene(
  baseName: string,
  scene: SdScene,
  pieceValues: Map<string, string>,
): ParsedScene[] {
  const slots = scene.slots ?? []
  if (slots.length === 0) {
    return [{ name: baseName, placeholders: {}, sortOrder: 0 }]
  }

  // Filter each group to enabled alternatives only
  const enabledGroups: SdAlternative[][] = []
  for (const group of slots) {
    const enabled = group.filter((alt) => alt.enabled !== false)
    if (enabled.length > 0) {
      enabledGroups.push(enabled)
    }
  }

  if (enabledGroups.length === 0) {
    return [{ name: baseName, placeholders: {}, sortOrder: 0 }]
  }

  // Compute Cartesian product
  const combinations = cartesianProduct(enabledGroups)

  const results: ParsedScene[] = []
  const needsIndex = combinations.length > 1

  for (let i = 0; i < combinations.length; i++) {
    const combo = combinations[i]

    // Concatenate prompts from each group
    const parts = combo.map((alt) => alt.prompt.trim()).filter(Boolean)
    let combined = parts.join(', ')

    // Replace <library_name.piece_name> → actual value from library
    combined = combined.replace(LIB_REF_RE, (_, libName, pieceName) => {
      return pieceValues.get(`${libName}.${pieceName}`) ?? ''
    })

    // Clean artifacts: double commas, leading/trailing commas/whitespace
    combined = cleanPrompt(combined)

    const placeholders: Record<string, string> = { _template: combined }

    const name = needsIndex ? `${baseName}.${i + 1}` : baseName
    results.push({ name, placeholders, sortOrder: 0 })
  }

  return results
}

function cartesianProduct<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return [[]]
  return arrays.reduce<T[][]>(
    (acc, group) => acc.flatMap((combo) => group.map((item) => [...combo, item])),
    [[]],
  )
}

function cleanPrompt(text: string): string {
  // Replace multiple commas (with optional whitespace between) with single comma
  let result = text.replace(/,(\s*,)+/g, ',')
  // Remove leading/trailing commas and whitespace
  result = result.replace(/^\s*,\s*/, '').replace(/\s*,\s*$/, '')
  // Normalize whitespace around commas
  result = result.replace(/\s*,\s*/g, ', ')
  return result.trim()
}
