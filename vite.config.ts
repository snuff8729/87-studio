import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { resolve, normalize } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

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
          basePath = resolve('./data/images')
          relativePath = pathname.slice('/api/images/'.length)
        } else if (pathname.startsWith('/api/thumbnails/')) {
          basePath = resolve('./data/thumbnails')
          relativePath = pathname.slice('/api/thumbnails/'.length)
        } else if (pathname.startsWith('/api/downloads/')) {
          basePath = resolve('./data/downloads')
          relativePath = pathname.slice('/api/downloads/'.length)
        }

        if (!basePath || !relativePath) return next()

        const filePath = resolve(basePath, normalize(decodeURIComponent(relativePath)))

        if (!filePath.startsWith(basePath)) {
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
        res.setHeader('Content-Type', isZip ? 'application/zip' : 'image/png')
        if (isZip) {
          const filename = relativePath.split('/').pop() ?? 'download.zip'
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
        res.end(data)
      })
    },
  }
}

const config = defineConfig({
  plugins: [
    serveDataFiles(),
    devtools(),
    nitro(),
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
