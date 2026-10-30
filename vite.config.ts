import { extname, normalize, resolve, sep } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { dataPath } from './src/server/data-dir'
import type { Plugin } from 'vite'

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.zip': 'application/zip',
  '.bin': 'application/octet-stream',
}

function serveDataFiles(): Plugin {
  return {
    name: 'serve-data-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next()

        const url = new URL(req.url, 'http://localhost')
        const pathname = url.pathname

        let basePath: string | null = null
        let relativePath: string | null = null

        if (pathname.startsWith('/api/images/')) {
          basePath = resolve(dataPath('./data/images'))
          relativePath = pathname.slice('/api/images/'.length)
        } else if (pathname.startsWith('/api/thumbnails/')) {
          basePath = resolve(dataPath('./data/thumbnails'))
          relativePath = pathname.slice('/api/thumbnails/'.length)
        } else if (pathname.startsWith('/api/tag-images/')) {
          basePath = resolve(dataPath('./data/tag-images'))
          relativePath = pathname.slice('/api/tag-images/'.length)
        } else if (pathname.startsWith('/api/references/')) {
          basePath = resolve(dataPath('./data/references'))
          relativePath = pathname.slice('/api/references/'.length)
        } else if (pathname.startsWith('/api/downloads/')) {
          basePath = resolve(dataPath('./data/downloads'))
          relativePath = pathname.slice('/api/downloads/'.length)
        }

        if (!basePath || !relativePath) return next()

        const filePath = resolve(
          basePath,
          normalize(decodeURIComponent(relativePath)),
        )

        if (filePath !== basePath && !filePath.startsWith(basePath + sep)) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }

        if (!existsSync(filePath)) {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        const data = readFileSync(filePath)
        const isZip = filePath.endsWith('.zip')
        res.setHeader(
          'Content-Type',
          CONTENT_TYPES[extname(filePath).toLowerCase()] ??
            'application/octet-stream',
        )
        if (isZip) {
          const filename = relativePath.split('/').pop() ?? 'download.zip'
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`,
          )
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
        res.end(data)
      })
    },
  }
}

function getAppVersion(): string {
  try {
    return execSync('git describe --tags --abbrev=0', {
      encoding: 'utf-8',
    }).trim()
  } catch {
    return 'dev'
  }
}

const config = defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion()),
  },
  server: {
    host: '0.0.0.0',
  },
  plugins: [
    serveDataFiles(),
    devtools(),
    nitro({
      handlers: [
        {
          route: '',
          middleware: true,
          handler: './src/server/api/data-files.ts',
        },
      ],
    }),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
