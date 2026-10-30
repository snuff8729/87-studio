import { describe, expect, it, vi } from 'vitest'
import { createPendingSaves } from '../pending-saves'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

describe('createPendingSaves', () => {
  it('flushAll resolves immediately with nothing registered', async () => {
    await expect(createPendingSaves().flushAll()).resolves.toBeUndefined()
  })

  it('flushAll calls every flush and awaits all of them', async () => {
    const registry = createPendingSaves()
    const a = deferred()
    const b = deferred()
    const flushA = vi.fn(() => a.promise)
    const flushB = vi.fn(() => b.promise)
    registry.register({ flush: flushA })
    registry.register({ flush: flushB })

    let done = false
    const all = registry.flushAll().then(() => (done = true))
    expect(flushA).toHaveBeenCalledTimes(1)
    expect(flushB).toHaveBeenCalledTimes(1)

    a.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(done).toBe(false)

    b.resolve()
    await all
    expect(done).toBe(true)
  })

  it('a rejected flush does not reject flushAll or skip others', async () => {
    const registry = createPendingSaves()
    const ok = vi.fn(() => Promise.resolve())
    registry.register({ flush: () => Promise.reject(new Error('x')) })
    registry.register({ flush: ok })
    await expect(registry.flushAll()).resolves.toBeUndefined()
    expect(ok).toHaveBeenCalled()
  })

  it('unregister removes the entry', async () => {
    const registry = createPendingSaves()
    const flush = vi.fn(() => Promise.resolve())
    const unregister = registry.register({ flush })
    unregister()
    await registry.flushAll()
    expect(flush).not.toHaveBeenCalled()
  })

  it('discard(key) only discards entries with that key', () => {
    const registry = createPendingSaves()
    const d1 = vi.fn()
    const d2 = vi.fn()
    registry.register({ key: 'scene:1', flush: vi.fn(), discard: d1 })
    registry.register({ key: 'scene:2', flush: vi.fn(), discard: d2 })
    registry.register({ flush: vi.fn() })
    registry.discard('scene:1')
    expect(d1).toHaveBeenCalledTimes(1)
    expect(d2).not.toHaveBeenCalled()
  })
})
