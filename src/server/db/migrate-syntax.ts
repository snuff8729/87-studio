/**
 * One-time data migration: old placeholder/bundle syntax → new unified syntax.
 *
 * Placeholder: \\name\\ → @{slot:name}
 * Bundle: @{name} → @{bundle:name}  (only for refs NOT already prefixed)
 */

import type Database from 'better-sqlite3'

const LEGACY_PLACEHOLDER_RE = /\\\\(\w+)\\\\/g
const LEGACY_BUNDLE_RE = /@\{(?!slot:|bundle:)([^}]+)\}/g

function migratePlaceholders(text: string): string {
  return text.replace(LEGACY_PLACEHOLDER_RE, (_, name) => `@{slot:${name}}`)
}

function migrateBundleRefs(text: string): string {
  return text.replace(LEGACY_BUNDLE_RE, (_, name) => `@{bundle:${name}}`)
}

function migrateText(text: string): string {
  return migrateBundleRefs(migratePlaceholders(text))
}

function migrateJsonValues(json: string): string {
  if (!json || json === '{}') return json
  try {
    const obj = JSON.parse(json) as Record<string, string>
    const migrated: Record<string, string> = {}
    for (const [key, value] of Object.entries(obj)) {
      migrated[key] = typeof value === 'string' ? migrateText(value) : value
    }
    return JSON.stringify(migrated)
  } catch {
    return json
  }
}

export function migrateSyntaxV1(db: Database.Database): number {
  let totalUpdated = 0

  const textColumns = [
    { table: 'projects', columns: ['general_prompt', 'negative_prompt'] },
    { table: 'characters', columns: ['char_prompt', 'char_negative'] },
    { table: 'prompt_bundles', columns: ['content'] },
  ]

  for (const { table, columns } of textColumns) {
    const rows = db
      .prepare(`SELECT id, ${columns.join(', ')} FROM ${table}`)
      .all() as Array<Record<string, any>>
    for (const row of rows) {
      const updates: Record<string, string> = {}
      let changed = false
      for (const col of columns) {
        const original = row[col] ?? ''
        const migrated = migrateText(original)
        if (migrated !== original) {
          updates[col] = migrated
          changed = true
        }
      }
      if (changed) {
        const setClauses = Object.keys(updates)
          .map((c) => `${c} = ?`)
          .join(', ')
        const values = Object.values(updates)
        db.prepare(`UPDATE ${table} SET ${setClauses} WHERE id = ?`).run(
          ...values,
          row.id,
        )
        totalUpdated++
      }
    }
  }

  const jsonColumns = [
    { table: 'scenes', column: 'placeholders', pk: 'id' },
    { table: 'project_scenes', column: 'placeholders', pk: 'id' },
    { table: 'character_scene_overrides', column: 'placeholders', pk: 'id' },
  ]

  for (const { table, column, pk } of jsonColumns) {
    const rows = db
      .prepare(`SELECT ${pk}, ${column} FROM ${table}`)
      .all() as Array<Record<string, any>>
    for (const row of rows) {
      const original = row[column] ?? '{}'
      const migrated = migrateJsonValues(original)
      if (migrated !== original) {
        db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${pk} = ?`).run(
          migrated,
          row[pk],
        )
        totalUpdated++
      }
    }
  }

  return totalUpdated
}
