import { join, resolve } from 'node:path'

/**
 * DB-stored file paths are always logical (`data/images/...`). When
 * STUDIO_DATA_DIR is set (demo / test servers), logical paths are mapped onto
 * that directory at every filesystem access. Unset: paths are used untouched.
 */
export function resolveDataPath(p: string, dataDir?: string): string {
  if (!dataDir) return p
  const m = p.replaceAll('\\', '/').match(/^(?:\.\/)?data(?:\/(.*))?$/)
  if (!m) return p
  return m[1] ? join(resolve(dataDir), m[1]) : resolve(dataDir)
}

export function getDataDir(): string | undefined {
  const dir = process.env.STUDIO_DATA_DIR
  return dir ? resolve(dir) : undefined
}

export function dataPath(p: string): string {
  return resolveDataPath(p, getDataDir())
}
