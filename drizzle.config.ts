import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.STUDIO_DATA_DIR
      ? `${process.env.STUDIO_DATA_DIR}/studio.db`
      : './data/studio.db',
  },
})
