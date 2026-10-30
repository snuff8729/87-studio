import { describe, expect, it } from 'vitest'
import { buildNaiRequestInit } from '../nai-request'

describe('buildNaiRequestInit', () => {
  it('sends V5 as multipart with a request blob and no Content-Type', async () => {
    const body = { model: 'nai-diffusion-5-full', input: 'cat', parameters: {} }
    const init = buildNaiRequestInit('KEY', body)
    expect(init.headers).toEqual({ Authorization: 'Bearer KEY' })
    expect(init.body).toBeInstanceOf(FormData)
    const part = (init.body as FormData).get('request') as File
    expect(part.type).toBe('application/json')
    expect(part.name).toBe('blob')
    expect(JSON.parse(await part.text())).toEqual(body)
  })

  it('sends V4.5 as a JSON string with Content-Type', () => {
    const body = { model: 'nai-diffusion-4-5-full', input: 'cat' }
    const init = buildNaiRequestInit('KEY', body)
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer KEY',
    })
    expect(JSON.parse(init.body as string)).toEqual(body)
  })
})
