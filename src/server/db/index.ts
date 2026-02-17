import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { initLogDirectory, createLogger } from '../services/logger'

const log = createLogger('db')

const DB_PATH = './data/studio.db'

initLogDirectory()
mkdirSync(dirname(DB_PATH), { recursive: true })

const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

log.info('init', 'Database initialized', { path: DB_PATH })

export const db = drizzle(sqlite, { schema })
