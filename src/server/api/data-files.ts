import { normalize, resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { defineHandler } from 'nitro/h3'

export default defineHandler((event) => {
  if (event.req.method !== 'GET' && event.req.method !== 'HEAD') return

  const pathname = event.url.pathname

  let basePath: string | null = null
  let relativePath: string | null = null

  if (pathname.startsWith('/api/images/')) {
    basePath = resolve('./data/images')
    relativePath = pathname.slice('/api/images/'.length)
  } else if (pathname.startsWith('/api/thumbnails/')) {
    basePath = resolve('./data/thumbnails')
    relativePath = pathname.slice('/api/thumbnails/'.length)
  } else if (pathname.startsWith('/api/references/')) {
    basePath = resolve('./data/references')
    relativePath = pathname.slice('/api/references/'.length)
  } else if (pathname.startsWith('/api/downloads/')) {
    basePath = resolve('./data/downloads')
    relativePath = pathname.slice('/api/downloads/'.length)
  }

  if (!basePath || !relativePath) return

  const filePath = resolve(
    basePath,
    normalize(decodeURIComponent(relativePath)),
  )

  if (!filePath.startsWith(basePath)) {
    return new Response('Forbidden', { status: 403 })
  }

  if (!existsSync(filePath)) {
    return new Response('Not found', { status: 404 })
  }

  const data = readFileSync(filePath)
  const isZip = filePath.endsWith('.zip')

  const headers: Record<string, string> = {
    'Content-Type': isZip ? 'application/zip' : 'image/png',
  }

  if (isZip) {
    const filename = relativePath.split('/').pop() ?? 'download.zip'
    headers['Content-Disposition'] = `attachment; filename="${filename}"`
  } else {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable'
  }

  return new Response(data, { headers })
})
