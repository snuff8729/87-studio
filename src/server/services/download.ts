export const DEFAULT_FILENAME_TEMPLATE = '{{project_name}}_{{scene_name}}_{{seed}}'

const FORBIDDEN_CHARS = /[<>:"/\\|?*\x00-\x1f]/g

export interface FilenameVars {
  project_name?: string
  scene_name?: string
  seed?: number | null
  index?: number
  date?: string
  rating?: number | null
  id?: number
  wins?: number
  win_rate?: string
}

export function resolveFilenameTemplate(
  template: string,
  vars: FilenameVars,
): string {
  let result = template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key as keyof FilenameVars]
    if (value === undefined || value === null) return ''
    return String(value)
  })

  // Remove forbidden filesystem characters
  result = result.replace(FORBIDDEN_CHARS, '_')
  // Collapse multiple underscores
  result = result.replace(/_+/g, '_').replace(/^_|_$/g, '')

  return result || 'image'
}
