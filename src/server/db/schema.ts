import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ─── Projects ───────────────────────────────────────────────────────────────
export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  generalPrompt: text('general_prompt').default(''),
  negativePrompt: text('negative_prompt').default(''),
  parameters: text('parameters').default('{}'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ─── Characters ─────────────────────────────────────────────────────────────
export const characters = sqliteTable(
  'characters',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    slotIndex: integer('slot_index').default(0),
    name: text('name').notNull(),
    charPrompt: text('char_prompt').notNull().default(''),
    charNegative: text('char_negative').notNull().default(''),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('characters_project_slot_idx').on(table.projectId, table.slotIndex),
    index('characters_project_id_idx').on(table.projectId),
  ],
)

// ─── Scene Packs (global templates) ─────────────────────────────────────────
export const scenePacks = sqliteTable('scene_packs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ─── Scenes (within a scene pack) ───────────────────────────────────────────
export const scenes = sqliteTable(
  'scenes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scenePackId: integer('scene_pack_id')
      .notNull()
      .references(() => scenePacks.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    placeholders: text('placeholders').default('{}'),
    sortOrder: integer('sort_order').default(0),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('scenes_pack_name_idx').on(table.scenePackId, table.name),
    index('scenes_scene_pack_id_idx').on(table.scenePackId),
  ],
)

// ─── Project Scene Packs (snapshot of global pack assigned to project) ──────
export const projectScenePacks = sqliteTable(
  'project_scene_packs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    scenePackId: integer('scene_pack_id').references(() => scenePacks.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => [index('project_scene_packs_project_id_idx').on(table.projectId)],
)

// ─── Project Scenes (snapshot of scenes within project) ─────────────────────
export const projectScenes = sqliteTable(
  'project_scenes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectScenePackId: integer('project_scene_pack_id')
      .notNull()
      .references(() => projectScenePacks.id, { onDelete: 'cascade' }),
    sourceSceneId: integer('source_scene_id').references(() => scenes.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    placeholders: text('placeholders').default('{}'),
    thumbnailImageId: integer('thumbnail_image_id'),
    sortOrder: integer('sort_order').default(0),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('project_scenes_pack_name_idx').on(table.projectScenePackId, table.name),
    index('project_scenes_pack_id_idx').on(table.projectScenePackId),
  ],
)

// ─── Character Scene Overrides ──────────────────────────────────────────────
export const characterSceneOverrides = sqliteTable(
  'character_scene_overrides',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectSceneId: integer('project_scene_id')
      .notNull()
      .references(() => projectScenes.id, { onDelete: 'cascade' }),
    characterId: integer('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    placeholders: text('placeholders').default('{}'),
  },
  (table) => [
    uniqueIndex('char_scene_override_unique_idx').on(table.projectSceneId, table.characterId),
    index('char_scene_overrides_scene_idx').on(table.projectSceneId),
    index('char_scene_overrides_char_idx').on(table.characterId),
  ],
)

// ─── Generation Jobs ────────────────────────────────────────────────────────
export const generationJobs = sqliteTable(
  'generation_jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    projectSceneId: integer('project_scene_id')
      .notNull()
      .references(() => projectScenes.id, { onDelete: 'cascade' }),
    sourceSceneId: integer('source_scene_id').references(() => scenes.id, {
      onDelete: 'set null',
    }),
    resolvedPrompts: text('resolved_prompts').notNull(),
    resolvedParameters: text('resolved_parameters').notNull(),
    totalCount: integer('total_count').default(1),
    completedCount: integer('completed_count').default(0),
    status: text('status').default('pending'),
    errorMessage: text('error_message'),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`),
  },
  (table) => [
    index('generation_jobs_status_idx').on(table.status),
    index('generation_jobs_project_id_idx').on(table.projectId),
    index('generation_jobs_scene_id_idx').on(table.projectSceneId),
  ],
)

// ─── Generated Images ───────────────────────────────────────────────────────
export const generatedImages = sqliteTable(
  'generated_images',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobId: integer('job_id')
      .notNull()
      .references(() => generationJobs.id, { onDelete: 'cascade' }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    projectSceneId: integer('project_scene_id')
      .notNull()
      .references(() => projectScenes.id, { onDelete: 'cascade' }),
    sourceSceneId: integer('source_scene_id').references(() => scenes.id, {
      onDelete: 'set null',
    }),
    filePath: text('file_path').notNull(),
    thumbnailPath: text('thumbnail_path'),
    seed: integer('seed'),
    metadata: text('metadata').default('{}'),
    isFavorite: integer('is_favorite').default(0),
    rating: integer('rating'),
    memo: text('memo'),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => [
    index('generated_images_project_id_idx').on(table.projectId),
    index('generated_images_scene_id_idx').on(table.projectSceneId),
    index('generated_images_source_scene_idx').on(table.sourceSceneId),
    index('generated_images_favorite_idx').on(table.isFavorite),
    index('generated_images_job_id_idx').on(table.jobId),
  ],
)

// ─── Tags ───────────────────────────────────────────────────────────────────
export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
})

// ─── Image Tags (junction) ──────────────────────────────────────────────────
export const imageTags = sqliteTable(
  'image_tags',
  {
    imageId: integer('image_id')
      .notNull()
      .references(() => generatedImages.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.imageId, table.tagId] }),
    index('image_tags_tag_id_idx').on(table.tagId),
  ],
)

// ─── Settings ───────────────────────────────────────────────────────────────
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})
