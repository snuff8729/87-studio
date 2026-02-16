import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { generatedImages, tournamentMatches } from '../db/schema'
import { eq, sql, desc } from 'drizzle-orm'

export const getTournamentState = createServerFn({ method: 'GET' })
  .inputValidator((projectSceneId: number) => projectSceneId)
  .handler(async ({ data: projectSceneId }) => {
    const images = db
      .select({
        id: generatedImages.id,
        thumbnailPath: generatedImages.thumbnailPath,
        filePath: generatedImages.filePath,
        tournamentWins: generatedImages.tournamentWins,
        tournamentLosses: generatedImages.tournamentLosses,
      })
      .from(generatedImages)
      .where(eq(generatedImages.projectSceneId, projectSceneId))
      .all()

    const matchCount = db
      .select({ count: sql<number>`count(*)` })
      .from(tournamentMatches)
      .where(eq(tournamentMatches.projectSceneId, projectSceneId))
      .get()?.count ?? 0

    return { images, matchCount }
  })

export const getNextPair = createServerFn({ method: 'GET' })
  .inputValidator((projectSceneId: number) => projectSceneId)
  .handler(async ({ data: projectSceneId }) => {
    const imageIds = db
      .select({ id: generatedImages.id })
      .from(generatedImages)
      .where(eq(generatedImages.projectSceneId, projectSceneId))
      .all()
      .map((r) => r.id)

    if (imageIds.length < 2) return null

    // Count appearances per image in this scene's matches
    const appearances: Record<number, number> = {}
    for (const id of imageIds) appearances[id] = 0

    const matches = db
      .select({ image1Id: tournamentMatches.image1Id, image2Id: tournamentMatches.image2Id })
      .from(tournamentMatches)
      .where(eq(tournamentMatches.projectSceneId, projectSceneId))
      .all()

    for (const m of matches) {
      if (m.image1Id in appearances) appearances[m.image1Id]++
      if (m.image2Id in appearances) appearances[m.image2Id]++
    }

    // Sort by appearance count ascending
    const sorted = imageIds.sort((a, b) => appearances[a] - appearances[b])

    // Pick from lowest appearance bucket
    const minCount = appearances[sorted[0]]
    const minBucket = sorted.filter((id) => appearances[id] === minCount)

    let id1: number, id2: number

    if (minBucket.length >= 2) {
      // Shuffle and pick 2
      const shuffled = minBucket.sort(() => Math.random() - 0.5)
      id1 = shuffled[0]
      id2 = shuffled[1]
    } else {
      id1 = minBucket[0]
      // Pick from next bucket
      const rest = sorted.filter((id) => id !== id1)
      id2 = rest[Math.floor(Math.random() * rest.length)]
    }

    // Randomize left/right
    if (Math.random() > 0.5) [id1, id2] = [id2, id1]

    const img1 = db
      .select({
        id: generatedImages.id,
        thumbnailPath: generatedImages.thumbnailPath,
        filePath: generatedImages.filePath,
        tournamentWins: generatedImages.tournamentWins,
        tournamentLosses: generatedImages.tournamentLosses,
      })
      .from(generatedImages)
      .where(eq(generatedImages.id, id1))
      .get()!

    const img2 = db
      .select({
        id: generatedImages.id,
        thumbnailPath: generatedImages.thumbnailPath,
        filePath: generatedImages.filePath,
        tournamentWins: generatedImages.tournamentWins,
        tournamentLosses: generatedImages.tournamentLosses,
      })
      .from(generatedImages)
      .where(eq(generatedImages.id, id2))
      .get()!

    return { image1: img1, image2: img2 }
  })

export const recordMatch = createServerFn({ method: 'POST' })
  .inputValidator(
    (input: {
      projectSceneId: number
      image1Id: number
      image2Id: number
      result: 'left' | 'right' | 'both_win' | 'both_lose'
    }) => input,
  )
  .handler(async ({ data }) => {
    const { projectSceneId, image1Id, image2Id, result } = data

    db.insert(tournamentMatches)
      .values({ projectSceneId, image1Id, image2Id, result })
      .run()

    // Update W/L counts
    if (result === 'left') {
      db.update(generatedImages)
        .set({ tournamentWins: sql`${generatedImages.tournamentWins} + 1` })
        .where(eq(generatedImages.id, image1Id))
        .run()
      db.update(generatedImages)
        .set({ tournamentLosses: sql`${generatedImages.tournamentLosses} + 1` })
        .where(eq(generatedImages.id, image2Id))
        .run()
    } else if (result === 'right') {
      db.update(generatedImages)
        .set({ tournamentLosses: sql`${generatedImages.tournamentLosses} + 1` })
        .where(eq(generatedImages.id, image1Id))
        .run()
      db.update(generatedImages)
        .set({ tournamentWins: sql`${generatedImages.tournamentWins} + 1` })
        .where(eq(generatedImages.id, image2Id))
        .run()
    } else if (result === 'both_win') {
      db.update(generatedImages)
        .set({ tournamentWins: sql`${generatedImages.tournamentWins} + 1` })
        .where(eq(generatedImages.id, image1Id))
        .run()
      db.update(generatedImages)
        .set({ tournamentWins: sql`${generatedImages.tournamentWins} + 1` })
        .where(eq(generatedImages.id, image2Id))
        .run()
    } else if (result === 'both_lose') {
      db.update(generatedImages)
        .set({ tournamentLosses: sql`${generatedImages.tournamentLosses} + 1` })
        .where(eq(generatedImages.id, image1Id))
        .run()
      db.update(generatedImages)
        .set({ tournamentLosses: sql`${generatedImages.tournamentLosses} + 1` })
        .where(eq(generatedImages.id, image2Id))
        .run()
    }

    return { ok: true }
  })

export const undoLastMatch = createServerFn({ method: 'POST' })
  .inputValidator((projectSceneId: number) => projectSceneId)
  .handler(async ({ data: projectSceneId }) => {
    const last = db
      .select()
      .from(tournamentMatches)
      .where(eq(tournamentMatches.projectSceneId, projectSceneId))
      .orderBy(desc(tournamentMatches.id))
      .limit(1)
      .get()

    if (!last) return { undone: null }

    const { image1Id, image2Id, result } = last

    // Reverse W/L
    if (result === 'left') {
      db.update(generatedImages)
        .set({ tournamentWins: sql`max(0, ${generatedImages.tournamentWins} - 1)` })
        .where(eq(generatedImages.id, image1Id))
        .run()
      db.update(generatedImages)
        .set({ tournamentLosses: sql`max(0, ${generatedImages.tournamentLosses} - 1)` })
        .where(eq(generatedImages.id, image2Id))
        .run()
    } else if (result === 'right') {
      db.update(generatedImages)
        .set({ tournamentLosses: sql`max(0, ${generatedImages.tournamentLosses} - 1)` })
        .where(eq(generatedImages.id, image1Id))
        .run()
      db.update(generatedImages)
        .set({ tournamentWins: sql`max(0, ${generatedImages.tournamentWins} - 1)` })
        .where(eq(generatedImages.id, image2Id))
        .run()
    } else if (result === 'both_win') {
      db.update(generatedImages)
        .set({ tournamentWins: sql`max(0, ${generatedImages.tournamentWins} - 1)` })
        .where(eq(generatedImages.id, image1Id))
        .run()
      db.update(generatedImages)
        .set({ tournamentWins: sql`max(0, ${generatedImages.tournamentWins} - 1)` })
        .where(eq(generatedImages.id, image2Id))
        .run()
    } else if (result === 'both_lose') {
      db.update(generatedImages)
        .set({ tournamentLosses: sql`max(0, ${generatedImages.tournamentLosses} - 1)` })
        .where(eq(generatedImages.id, image1Id))
        .run()
      db.update(generatedImages)
        .set({ tournamentLosses: sql`max(0, ${generatedImages.tournamentLosses} - 1)` })
        .where(eq(generatedImages.id, image2Id))
        .run()
    }

    db.delete(tournamentMatches).where(eq(tournamentMatches.id, last.id)).run()

    return { undone: last }
  })

export const resetTournament = createServerFn({ method: 'POST' })
  .inputValidator((projectSceneId: number) => projectSceneId)
  .handler(async ({ data: projectSceneId }) => {
    // Get all image IDs for this scene
    const imageIds = db
      .select({ id: generatedImages.id })
      .from(generatedImages)
      .where(eq(generatedImages.projectSceneId, projectSceneId))
      .all()
      .map((r) => r.id)

    // Delete all matches for this scene
    db.delete(tournamentMatches)
      .where(eq(tournamentMatches.projectSceneId, projectSceneId))
      .run()

    // Reset W/L for all images in this scene
    if (imageIds.length > 0) {
      db.update(generatedImages)
        .set({ tournamentWins: 0, tournamentLosses: 0 })
        .where(eq(generatedImages.projectSceneId, projectSceneId))
        .run()
    }

    return { ok: true }
  })
