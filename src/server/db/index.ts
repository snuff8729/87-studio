import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { dataPath } from '../data-dir'
import '../services/nai-mock'
import { mkdirSync } from '../data-fs'
import { createLogger, initLogDirectory } from '../services/logger'
import * as schema from './schema'
import { metadataHasPromptTag } from '@/lib/prompt-tags'

const log = createLogger('db')

const DB_PATH = './data/studio.db'

initLogDirectory()
mkdirSync(dirname(DB_PATH), { recursive: true })

const sqlite = new Database(dataPath(DB_PATH))
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// Exact whole-token prompt tag match inside SQL (see services/image-query.ts),
// so pagination and prev/next keyset queries stay correct.
sqlite.function(
  'prompt_has_tag',
  { deterministic: true },
  (metadata: unknown, tag: unknown) =>
    metadataHasPromptTag(
      typeof metadata === 'string' ? metadata : null,
      String(tag),
    )
      ? 1
      : 0,
)

log.info('init', 'Database initialized', { path: DB_PATH })

export const db = drizzle(sqlite, { schema })
