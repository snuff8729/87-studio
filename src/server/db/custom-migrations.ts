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

const migrations: Array<Migration> = [
  {
    key: 'syntax_v1',
    description:
      'Migrate \\\\name\\\\ → @{slot:name} and @{name} → @{bundle:name}',
    run: migrateSyntaxV1,
  },
]

function main() {
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
