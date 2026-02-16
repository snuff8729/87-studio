import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { scenePacks, scenes } from '../db/schema'

export const importScenePack = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      name: string
      scenes: Array<{ name: string; placeholders: string; sortOrder: number }>
    }) => data,
  )
  .handler(async ({ data }) => {
    let pack!: { id: number; name: string }
    db.transaction((tx) => {
      pack = tx
        .insert(scenePacks)
        .values({ name: data.name })
        .returning()
        .get()

      for (const scene of data.scenes) {
        tx.insert(scenes)
          .values({
            scenePackId: pack.id,
            name: scene.name,
            placeholders: scene.placeholders,
            sortOrder: scene.sortOrder,
          })
          .run()
      }
    })

    return pack
  })
