/**
 * Custom data migrations that run once, tracked via the settings table.
 *
 * Each migration has a unique key. On first run, the migration executes and
 * a flag is written to settings. Subsequent runs skip completed migrations.
 *
 * Run: npx tsx src/server/db/custom-migrations.ts
 */

import Database from 'better-sqlite3'
import { resolve } from 'path'
import { migrateSyntaxV1 } from './migrate-syntax'

interface Migration {
  key: string
  description: string
  run: (db: Database.Database) => number
}

// Migrations run in order. Never reorder or remove entries — only append.
const migrations: Array<Migration> = [
  {
    key: '001_syntax_v1',
    description:
      'Migrate \\\\name\\\\ → @{slot:name} and @{name} → @{bundle:name}',
    run: migrateSyntaxV1,
  },
]

const KEY_RE = /^\d{3}_\w+$/

function validate() {
  const seen = new Set<string>()

  for (const m of migrations) {
    if (!KEY_RE.test(m.key)) {
      throw new Error(
        `[migration] Invalid key format: "${m.key}". Must match NNN_name (e.g. 001_syntax_v1).`,
      )
    }

    const prefix = m.key.slice(0, 3)
    if (seen.has(prefix)) {
      throw new Error(
        `[migration] Duplicate order prefix: "${prefix}" in key "${m.key}".`,
      )
    }
    seen.add(prefix)
  }

  // Verify keys are in ascending order
  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i].key < migrations[i - 1].key) {
      throw new Error(
        `[migration] Out of order: "${migrations[i].key}" must come after "${migrations[i - 1].key}".`,
      )
    }
  }
}

function main() {
  validate()

  const DB_PATH = resolve(process.cwd(), 'data/studio.db')
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')

  // Ensure settings table exists (it should, but be safe)
  db.prepare(
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
  ).run()

  let ran = 0

  for (const m of migrations) {
    const flag = db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .get(`migration_${m.key}`) as { value: string } | undefined

    if (flag) continue

    console.log(`  [migration] ${m.key}: ${m.description}`)
    const updated = m.run(db)
    console.log(`              ${updated} rows updated.`)

    db.prepare(
      `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
    ).run(`migration_${m.key}`, 'done')

    ran++
  }

  if (ran === 0) {
    console.log('  [migration] No pending custom migrations.')
  }

  db.close()
}

main()
