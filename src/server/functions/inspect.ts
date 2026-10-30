import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { characters, projects } from '../db/schema'
import { createLogger } from '../services/logger'

const log = createLogger('fn.inspect')

export const createProjectFromMetadata = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      name: string
      generalPrompt?: string
      negativePrompt?: string
      /** Output of `buildImport` (src/lib/nai-import.ts); unset keys use defaults. */
      parameters?: Record<string, unknown>
      characters?: Array<{
        name: string
        charPrompt: string
        charNegative?: string
      }>
    }) => data,
  )
  .handler(async ({ data }) => {
    const parametersJson = JSON.stringify(data.parameters ?? {})

    let project!: { id: number; name: string }

    db.transaction((tx) => {
      project = tx
        .insert(projects)
        .values({
          name: data.name,
          generalPrompt: data.generalPrompt ?? '',
          negativePrompt: data.negativePrompt ?? '',
          parameters: parametersJson,
        })
        .returning()
        .get()

      if (data.characters && data.characters.length > 0) {
        for (let i = 0; i < data.characters.length; i++) {
          const char = data.characters[i]
          tx.insert(characters)
            .values({
              projectId: project.id,
              slotIndex: i,
              name: char.name,
              charPrompt: char.charPrompt,
              charNegative: char.charNegative ?? '',
            })
            .run()
        }
      }
    })

    log.info('createFromMetadata', 'Project created from NAI metadata', {
      projectId: project.id,
      name: data.name,
      characterCount: data.characters?.length ?? 0,
      parameterKeys: Object.keys(data.parameters ?? {}),
    })

    return project
  })
