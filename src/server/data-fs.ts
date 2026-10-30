import {
  existsSync as _existsSync,
  mkdirSync as _mkdirSync,
  readFileSync as _readFileSync,
  readdirSync as _readdirSync,
  rmSync as _rmSync,
  statSync as _statSync,
  unlinkSync as _unlinkSync,
  writeFileSync as _writeFileSync,
} from 'node:fs'
import { dataPath } from './data-dir'

/** node:fs wrappers that map logical `data/...` paths via STUDIO_DATA_DIR. */
export const existsSync = (p: string) => _existsSync(dataPath(p))
export const mkdirSync = (p: string, o?: Parameters<typeof _mkdirSync>[1]) =>
  _mkdirSync(dataPath(p), o)
export const readFileSync = (p: string) => _readFileSync(dataPath(p))
export const readdirSync = (p: string) => _readdirSync(dataPath(p))
export const rmSync = (p: string, o?: Parameters<typeof _rmSync>[1]) =>
  _rmSync(dataPath(p), o)
export const statSync = (p: string) => _statSync(dataPath(p))
export const unlinkSync = (p: string) => _unlinkSync(dataPath(p))
export const writeFileSync = (
  p: string,
  d: Parameters<typeof _writeFileSync>[1],
) => _writeFileSync(dataPath(p), d)
