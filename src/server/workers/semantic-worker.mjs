// Child process hosting the EmbeddingGemma model (forked by
// src/server/services/semantic.ts). Killing this process frees all model
// memory. Plain .mjs on purpose: it is run by node directly, in dev and in the
// production build alike (resolved from the project folder).
//
// IPC (advanced serialization):
//   main -> worker: { type: 'init', cacheDir, modelId, dtype }
//                   { type: 'embed', id, texts }
//   worker -> main: { type: 'progress', file, loaded, total } | { type: 'ready' }
//                   { type: 'result', id, data: Float32Array, dim }
//                   { type: 'error', id?, message }
let pipe = null

const send = (m) => process.send?.(m)

process.on('disconnect', () => process.exit(0))
process.on('message', async (msg) => {
  try {
    if (msg.type === 'init') {
      const { pipeline, env } = await import('@huggingface/transformers')
      env.cacheDir = msg.cacheDir
      pipe = await pipeline('feature-extraction', msg.modelId, {
        dtype: msg.dtype,
        progress_callback: (p) => {
          if (p.status === 'progress' && p.file && p.total) {
            send({
              type: 'progress',
              file: p.file,
              loaded: p.loaded ?? 0,
              total: p.total,
            })
          }
        },
      })
      send({ type: 'ready' })
    } else if (msg.type === 'embed') {
      if (!pipe) throw new Error('model not loaded')
      const out = await pipe(msg.texts, { pooling: 'mean', normalize: true })
      const dim = out.dims[out.dims.length - 1]
      send({
        type: 'result',
        id: msg.id,
        data: new Float32Array(out.data),
        dim,
      })
    }
  } catch (e) {
    send({
      type: 'error',
      id: msg.id,
      message: e instanceof Error ? e.message : String(e),
    })
  }
})
