import { appendFileSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const LOGS_DIR = './data/logs'
const LOG_FILE = 'app.log'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_FILES = 5 // app.log + app.1.log ~ app.4.log

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

let currentSize = -1

function getLogFilePath(): string {
  return join(LOGS_DIR, LOG_FILE)
}

function getRotatedPath(index: number): string {
  return join(LOGS_DIR, `app.${index}.log`)
}

function loadCurrentSize(): number {
  try {
    return statSync(getLogFilePath()).size
  } catch {
    return 0
  }
}

function rotate(): void {
  // Delete oldest
  try { unlinkSync(getRotatedPath(MAX_FILES - 1)) } catch {}

  // Shift: app.3.log → app.4.log, ..., app.1.log → app.2.log
  for (let i = MAX_FILES - 2; i >= 1; i--) {
    try { renameSync(getRotatedPath(i), getRotatedPath(i + 1)) } catch {}
  }

  // app.log → app.1.log
  try { renameSync(getLogFilePath(), getRotatedPath(1)) } catch {}

  currentSize = 0
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

  if (currentSize === -1) {
    currentSize = loadCurrentSize()
  }

  if (currentSize >= MAX_FILE_SIZE) {
    rotate()
  }

  try {
    appendFileSync(getLogFilePath(), line)
    currentSize += Buffer.byteLength(line)
  } catch {}
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
  mkdirSync(LOGS_DIR, { recursive: true })
}
