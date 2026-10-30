import { createIsomorphicFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

/** Must match SIDEBAR_COOKIE_NAME in components/ui/sidebar.tsx */
const SIDEBAR_COOKIE_NAME = 'sidebar_state'

function parseOpen(value: string | undefined): boolean {
  // Default to expanded when the cookie is absent.
  return value !== 'false'
}

function readClientCookie(name: string): string | undefined {
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return undefined
}

/**
 * Reads the persisted sidebar open state so SSR and the client agree on the
 * initial render: from the request cookie on the server, document.cookie on
 * the client.
 */
export const getSidebarDefaultOpen = createIsomorphicFn()
  .server(() => parseOpen(getCookie(SIDEBAR_COOKIE_NAME)))
  .client(() => parseOpen(readClientCookie(SIDEBAR_COOKIE_NAME)))
