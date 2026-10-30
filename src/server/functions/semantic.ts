import { createServerFn } from '@tanstack/react-start'
import {
  deleteFiles,
  disable,
  enable,
  getStatus,
  semanticSearch,
} from '../services/semantic'

export type {
  SemanticPhase,
  SemanticRow,
  SemanticStatus,
} from '../services/semantic'

/** Current state; polled by the settings card and the Tag Search window. */
export const getSemanticStatus = createServerFn({ method: 'GET' }).handler(() =>
  getStatus(),
)

/** Manual on/off. On: downloads index + model if needed, then loads. */
export const setSemanticEnabled = createServerFn({ method: 'POST' })
  .inputValidator((data: { on: boolean }) => data)
  .handler(({ data }) => (data.on ? enable() : disable()))

/** Switch off and delete the model cache and the downloaded index. */
export const deleteSemanticFiles = createServerFn({ method: 'POST' }).handler(
  () => deleteFiles(),
)

/** Meaning-based tag hits; errors with SEMANTIC_NOT_READY unless ready. */
export const semanticTagSearch = createServerFn({ method: 'GET' })
  .inputValidator((data: { query: string; limit?: number }) => data)
  .handler(({ data }) =>
    semanticSearch(data.query, Math.min(data.limit ?? 50, 100)),
  )
