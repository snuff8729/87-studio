import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const LOGS_DIR = './data/logs'

type LogLevel = 'error' | 'warn' | 'info' | 'debug'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

const MIN_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug'

interface LogEntry {
  timestamp: string
  level: LogLevel
  service: string
  action: string
  message: string
  data?: Record<string, unknown>
  error?: { name: string; message: string; stack?: string }
}

export interface Logger {
  error(action: string, message: string, data?: Record<string, unknown>, error?: unknown): void
  warn(action: string, message: string, data?: Record<string, unknown>): void
  info(action: string, message: string, data?: Record<string, unknown>): void
  debug(action: string, message: string, data?: Record<string, unknown>): void
}

function formatError(err: unknown): LogEntry['error'] {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack }
  }
  return { name: 'Error', message: String(err) }
}

function getLogFilePath(): string {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return join(LOGS_DIR, `${date}.log`)
}

function writeLog(entry: LogEntry): void {
  const line = JSON.stringify(entry) + '\n'

  // Console output in development
  if (process.env.NODE_ENV !== 'production') {
    const levelTag = `[${entry.level.toUpperCase()}]`
    const prefix = `${levelTag} [${entry.service}] ${entry.action}`
    if (entry.level === 'error') {
      console.error(prefix, entry.message, entry.data ?? '', entry.error?.message ?? '')
    } else if (entry.level === 'warn') {
      console.warn(prefix, entry.message, entry.data ?? '')
    } else {
      console.log(prefix, entry.message, entry.data ?? '')
    }
  }

  // Async file write — fire and forget, never block the request
  appendFile(getLogFilePath(), line).catch(() => {})
}

export function createLogger(service: string): Logger {
  function log(level: LogLevel, action: string, message: string, data?: Record<string, unknown>, error?: unknown): void {
    if (LEVEL_PRIORITY[level] > LEVEL_PRIORITY[MIN_LEVEL]) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      action,
      message,
    }
    if (data && Object.keys(data).length > 0) entry.data = data
    if (error !== undefined) entry.error = formatError(error)

    writeLog(entry)
  }

  return {
    error: (action, message, data?, error?) => log('error', action, message, data, error),
    warn: (action, message, data?) => log('warn', action, message, data),
    info: (action, message, data?) => log('info', action, message, data),
    debug: (action, message, data?) => log('debug', action, message, data),
  }
}

export function initLogDirectory(): void {
  mkdir(LOGS_DIR, { recursive: true }).catch(() => {})
}
