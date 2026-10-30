import {
  
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import type {AnySQLiteColumn} from 'drizzle-orm/sqlite-core';

// ─── Projects ───────────────────────────────────────────────────────────────
export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  generalPrompt: text('general_prompt').default(''),
  negativePrompt: text('negative_prompt').default(''),
  parameters: text('parameters').default('{}'),
  thumbnailImageId: integer('thumbnail_image_id'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ─── Character Parts Library ────────────────────────────────────────────────
export const libraryCharacters = sqliteTable(
  'library_characters',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    /** NULL = global library row, otherwise project-only copy */
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    /** Library row this was detached from */
    sourceId: integer('source_id'),
    thumbnailImageId: integer('thumbnail_image_id'),
    sortOrder: integer('sort_order').default(0),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`),
  },
  (table) => [index('library_characters_project_id_idx').on(table.projectId)],
)

export const outfitItems = sqliteTable(
  'outfit_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    sourceId: integer('source_id'),
    thumbnailImageId: integer('thumbnail_image_id'),
    /** JSON: { [axisId]: number[] } — applies to all fragments of the item */
    conditions: text('conditions').default('{}'),
    /** JSON: number[] of library_areas ids this item occupies */
    areaIds: text('area_ids').default('[]'),
    /** JSON: Array<{ conditions: Condition; areaIds: number[] }> */
    coverRules: text('cover_rules').default('[]'),
    /** JSON: Array<{ name: string; default: string }> (`@{var:name}` tokens) */
    variables: text('variables').default('[]'),
    sortOrder: integer('sort_order').default(0),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`),
  },
  (table) => [index('outfit_items_project_id_idx').on(table.projectId)],
)

/** Global body areas used by outfit occlusion */
export const libraryAreas = sqliteTable('library_areas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  /** One level only: top-level areas have null */
  parentId: integer('parent_id').references(
    (): AnySQLiteColumn => libraryAreas.id,
    { onDelete: 'set null' },
  ),
  sortOrder: integer('sort_order').default(0),
})

export const outfitPresets = sqliteTable('outfit_presets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  /** JSON: number[] of outfit item ids (ordered) */
  itemIds: text('item_ids').default('[]'),
  thumbnailImageId: integer('thumbnail_image_id'),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

export const libraryAxes = sqliteTable(
  'library_axes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    ownerCharacterId: integer('owner_character_id').references(
      () => libraryCharacters.id,
      { onDelete: 'cascade' },
    ),
    ownerItemId: integer('owner_item_id').references(() => outfitItems.id, {
      onDelete: 'cascade',
    }),
    sortOrder: integer('sort_order').default(0),
  },
  (table) => [
    index('library_axes_owner_char_idx').on(table.ownerCharacterId),
    index('library_axes_owner_item_idx').on(table.ownerItemId),
  ],
)

export const libraryAxisValues = sqliteTable(
  'library_axis_values',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    axisId: integer('axis_id')
      .notNull()
      .references(() => libraryAxes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').default(0),
  },
  (table) => [index('library_axis_values_axis_idx').on(table.axisId)],
)

export const fragments = sqliteTable(
  'fragments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    characterId: integer('character_id').references(
      () => libraryCharacters.id,
      { onDelete: 'cascade' },
    ),
    itemId: integer('item_id').references(() => outfitItems.id, {
      onDelete: 'cascade',
    }),
    text: text('text').default(''),
    /** JSON: { [axisId]: number[] } */
    conditions: text('conditions').default('{}'),
    /** JSON: number[] of library_areas ids (item fragments only; [] = inherit the item's areas) */
    areaIds: text('area_ids').default('[]'),
    sortOrder: integer('sort_order').default(0),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`),
  },
  (table) => [
    index('fragments_character_idx').on(table.characterId),
    index('fragments_item_idx').on(table.itemId),
  ],
)

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
    libraryCharacterId: integer('library_character_id').references(
      () => libraryCharacters.id,
      { onDelete: 'set null' },
    ),
    /** JSON: number[] default outfit item ids (ordered) */
    outfitItemIds: text('outfit_item_ids').default('[]'),
    /** JSON: { [axisId]: valueId } local-axis defaults for this slot */
    axisValues: text('axis_values').default('{}'),
    /** JSON PositionSpec; NULL = ai */
    position: text('position'),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('characters_project_slot_idx').on(
      table.projectId,
      table.slotIndex,
    ),
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
    axisValues: text('axis_values').default('{}'),
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
    sortOrder: integer('sort_order').notNull().default(0),
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
    axisValues: text('axis_values').default('{}'),
    thumbnailImageId: integer('thumbnail_image_id'),
    sortOrder: integer('sort_order').default(0),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('project_scenes_pack_name_idx').on(
      table.projectScenePackId,
      table.name,
    ),
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
    axisValues: text('axis_values').default('{}'),
    /** JSON number[] or NULL (= slot default outfit) */
    outfitItemIds: text('outfit_item_ids'),
    /** JSON ScenePositionSpec; NULL = inherit the character default */
    position: text('position'),
  },
  (table) => [
    uniqueIndex('char_scene_override_unique_idx').on(
      table.projectSceneId,
      table.characterId,
    ),
    index('char_scene_overrides_scene_idx').on(table.projectSceneId),
    index('char_scene_overrides_char_idx').on(table.characterId),
  ],
)

// ─── Generation Batches ────────────────────────────────────────────────────
export const generationBatches = sqliteTable(
  'generation_batches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    label: text('label').notNull(),
    queueOrder: integer('queue_order').notNull(),
    status: text('status').default('pending'), // pending, running, completed, failed, cancelled
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => [
    index('generation_batches_status_order_idx').on(
      table.status,
      table.queueOrder,
    ),
  ],
)

// ─── Generation Jobs ────────────────────────────────────────────────────────
export const generationJobs = sqliteTable(
  'generation_jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    projectSceneId: integer('project_scene_id').references(
      () => projectScenes.id,
      { onDelete: 'cascade' },
    ),
    sourceSceneId: integer('source_scene_id').references(() => scenes.id, {
      onDelete: 'set null',
    }),
    batchId: integer('batch_id').references(() => generationBatches.id, {
      onDelete: 'cascade',
    }),
    queueOrder: integer('queue_order').default(0),
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
    index('generation_jobs_batch_order_idx').on(
      table.batchId,
      table.queueOrder,
    ),
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
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    projectSceneId: integer('project_scene_id').references(
      () => projectScenes.id,
      { onDelete: 'cascade' },
    ),
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
    tournamentWins: integer('tournament_wins').default(0),
    tournamentLosses: integer('tournament_losses').default(0),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => [
    index('generated_images_project_id_idx').on(table.projectId),
    index('generated_images_scene_id_idx').on(table.projectSceneId),
    index('generated_images_source_scene_idx').on(table.sourceSceneId),
    index('generated_images_favorite_idx').on(table.isFavorite),
    index('generated_images_job_id_idx').on(table.jobId),
    index('generated_images_project_created_idx').on(
      table.projectId,
      table.createdAt,
    ),
    index('generated_images_favorite_created_idx').on(
      table.isFavorite,
      table.createdAt,
    ),
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

// ─── Tournament Matches ─────────────────────────────────────────────────────
export const tournamentMatches = sqliteTable(
  'tournament_matches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectSceneId: integer('project_scene_id')
      .notNull()
      .references(() => projectScenes.id, { onDelete: 'cascade' }),
    image1Id: integer('image1_id')
      .notNull()
      .references(() => generatedImages.id, { onDelete: 'cascade' }),
    image2Id: integer('image2_id')
      .notNull()
      .references(() => generatedImages.id, { onDelete: 'cascade' }),
    result: text('result').notNull(), // 'left' | 'right' | 'both_win' | 'both_lose'
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => [
    index('tournament_matches_scene_idx').on(table.projectSceneId),
    index('tournament_matches_image1_idx').on(table.image1Id),
    index('tournament_matches_image2_idx').on(table.image2Id),
  ],
)

// ─── Prompt Bundles ─────────────────────────────────────────────────────────
export const promptBundles = sqliteTable('prompt_bundles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  description: text('description'),
  content: text('content').notNull().default(''),
  thumbnailImageId: integer('thumbnail_image_id'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ─── Bundle Tags ───────────────────────────────────────────────────────────
export const bundleTags = sqliteTable('bundle_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
})

// ─── Bundle Tag Assignments (junction) ─────────────────────────────────────
export const bundleTagAssignments = sqliteTable(
  'bundle_tag_assignments',
  {
    bundleId: integer('bundle_id')
      .notNull()
      .references(() => promptBundles.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => bundleTags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.bundleId, table.tagId] }),
    index('bundle_tag_assignments_tag_id_idx').on(table.tagId),
  ],
)

// ─── Tag Bookmarks ─────────────────────────────────────────────────────────
export const tagBookmarks = sqliteTable('tag_bookmarks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  memo: text('memo'),
  thumbnailImageId: integer('thumbnail_image_id'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ─── Tag Bookmark Images ───────────────────────────────────────────────────
export const tagBookmarkImages = sqliteTable(
  'tag_bookmark_images',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    bookmarkId: integer('bookmark_id')
      .notNull()
      .references(() => tagBookmarks.id, { onDelete: 'cascade' }),
    source: text('source').notNull(), // 'gallery' | 'upload'
    galleryImageId: integer('gallery_image_id'),
    filePath: text('file_path').notNull(),
    thumbnailPath: text('thumbnail_path'),
    sortOrder: integer('sort_order').default(0),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => [
    index('tag_bookmark_images_bookmark_id_idx').on(table.bookmarkId),
  ],
)

// ─── Tag Bookmark Tags (classification) ────────────────────────────────────
export const tagBookmarkTags = sqliteTable('tag_bookmark_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
})

// ─── Tag Bookmark Tag Assignments ──────────────────────────────────────────
export const tagBookmarkTagAssignments = sqliteTable(
  'tag_bookmark_tag_assignments',
  {
    bookmarkId: integer('bookmark_id')
      .notNull()
      .references(() => tagBookmarks.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tagBookmarkTags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.bookmarkId, table.tagId] }),
    index('tag_bookmark_tag_assignments_tag_id_idx').on(table.tagId),
  ],
)

// ─── Image Bundles (junction) ───────────────────────────────────────────────
export const imageBundles = sqliteTable(
  'image_bundles',
  {
    imageId: integer('image_id')
      .notNull()
      .references(() => generatedImages.id, { onDelete: 'cascade' }),
    bundleId: integer('bundle_id')
      .notNull()
      .references(() => promptBundles.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.imageId, table.bundleId] }),
    index('image_bundles_bundle_id_idx').on(table.bundleId),
  ],
)

/** Effective global axis values an image was generated with (any character) */
export const imageAxisValues = sqliteTable(
  'image_axis_values',
  {
    imageId: integer('image_id')
      .notNull()
      .references(() => generatedImages.id, { onDelete: 'cascade' }),
    axisId: integer('axis_id')
      .notNull()
      .references(() => libraryAxes.id, { onDelete: 'cascade' }),
    valueId: integer('value_id')
      .notNull()
      .references(() => libraryAxisValues.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.imageId, table.axisId, table.valueId] }),
    index('image_axis_values_axis_value_idx').on(table.axisId, table.valueId),
  ],
)

/** Library character / outfit item usage per image (kind has no FK on ref_id) */
export const imageLibraryLinks = sqliteTable(
  'image_library_links',
  {
    imageId: integer('image_id')
      .notNull()
      .references(() => generatedImages.id, { onDelete: 'cascade' }),
    /** 'character' | 'item' */
    kind: text('kind').notNull(),
    /** library_characters.id or outfit_items.id depending on kind */
    refId: integer('ref_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.imageId, table.kind, table.refId] }),
    index('image_library_links_ref_idx').on(table.kind, table.refId),
  ],
)

// ─── Reference Images ──────────────────────────────────────────────────────
export const referenceImages = sqliteTable(
  'reference_images',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }), // null = Quick Generate
    type: text('type').notNull(), // 'vibe' | 'precise'
    filePath: text('file_path').notNull(),
    thumbnailPath: text('thumbnail_path'),
    processedPath: text('processed_path'), // precise: resized+letterboxed image
    encodedVibePath: text('encoded_vibe_path'), // vibe: encoded .bin path
    encodedModel: text('encoded_model'), // vibe: model used for encoding
    strength: real('strength').notNull().default(0.6),
    informationExtracted: real('information_extracted').notNull().default(1.0), // vibe only
    fidelity: real('fidelity').notNull().default(1.0), // precise only
    referenceMode: text('reference_mode').notNull().default('character&style'), // precise: character/style/character&style
    sortOrder: integer('sort_order').notNull().default(0),
    enabled: integer('enabled').notNull().default(1),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`),
  },
  (table) => [
    index('reference_images_project_id_idx').on(table.projectId),
    index('reference_images_project_type_idx').on(table.projectId, table.type),
  ],
)

// ─── Settings ───────────────────────────────────────────────────────────────
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ─── Tag descriptions (localized, filled by import/translation later) ───────
export const tagDescriptions = sqliteTable(
  'tag_descriptions',
  {
    tag: text('tag').notNull(),
    locale: text('locale').notNull(),
    text: text('text').notNull(),
    source: text('source'),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.tag, table.locale] })],
)
