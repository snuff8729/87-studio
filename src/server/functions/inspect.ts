import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { projects, characters } from '../db/schema'
import { createLogger } from '../services/logger'

const log = createLogger('fn.inspect')

export const createProjectFromMetadata = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      name: string
      generalPrompt?: string
      negativePrompt?: string
      parameters?: {
        steps?: number
        cfg_scale?: number
        cfg_rescale?: number
        sampler?: string
        scheduler?: string
        smea?: boolean
        smeaDyn?: boolean
        width?: number
        height?: number
        qualityToggle?: boolean
        ucPreset?: number
        variety?: boolean
      }
      characters?: Array<{
        name: string
        charPrompt: string
        charNegative?: string
      }>
    }) => data,
  )
  .handler(async ({ data }) => {
    const params = data.parameters ?? {}
    const parametersJson = JSON.stringify({
      steps: params.steps ?? 28,
      scale: params.cfg_scale ?? 5,
      cfgRescale: params.cfg_rescale ?? 0,
      sampler: params.sampler ?? 'k_euler',
      scheduler: params.scheduler ?? 'native',
      sm: params.smea ?? false,
      sm_dyn: params.smeaDyn ?? false,
      width: params.width ?? 832,
      height: params.height ?? 1216,
      qualityToggle: params.qualityToggle ?? true,
      ucPreset: params.ucPreset ?? 0,
      skip_cfg_above_sigma: params.variety ? 19 : null,
    })

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
    })

    return project
  })
