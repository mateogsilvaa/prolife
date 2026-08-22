import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..')

/**
 * La configuración vive en el home, no junto al código: en la app empaquetada
 * ROOT apunta dentro del asar, que es de solo lectura.
 */
const CONFIG_FILE = path.join(os.homedir(), '.prolife', 'config.json')
const LEGACY_CONFIG = path.join(ROOT, 'prolife.config.json')

const DEFAULTS = {
  // Directorio REAL del ordenador donde vive todo: documentos + base de datos.
  baseDir: path.join(os.homedir(), 'Documents', 'ProLife'),
  port: 4321,
}

/** Permite abrir la app contra otro directorio sin tocar la configuración. */
const OVERRIDE = process.env.PROLIFE_DIR ? { baseDir: path.resolve(process.env.PROLIFE_DIR) } : {}

export function readConfig() {
  for (const file of [CONFIG_FILE, LEGACY_CONFIG]) {
    try {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')), ...OVERRIDE }
    } catch {
      /* siguiente */
    }
  }
  return { ...DEFAULTS, ...OVERRIDE }
}

export function writeConfig(patch) {
  const next = { ...readConfig(), ...patch }
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8')
  return next
}

/**
 * Sitios donde suele estar montada una carpeta que se sincroniza sola entre
 * ordenadores. Google Drive para escritorio monta una unidad («G:\Mi unidad»)
 * o una carpeta en el home según cómo esté configurado.
 */
export function cloudRoots() {
  const home = os.homedir()
  const out = []
  const add = (dir, provider, label) => {
    try {
      if (fs.statSync(dir).isDirectory()) out.push({ path: dir, provider, label })
    } catch {
      /* no está */
    }
  }

  if (process.platform === 'win32') {
    // Google Drive se monta como unidad virtual: hay que buscar la letra.
    for (const letter of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
      add(`${letter}:\\Mi unidad`, 'google', 'Google Drive')
      add(`${letter}:\\My Drive`, 'google', 'Google Drive')
    }
  }
  add(path.join(home, 'Google Drive'), 'google', 'Google Drive')
  add(path.join(home, 'My Drive'), 'google', 'Google Drive')
  add(path.join(home, 'Mi unidad'), 'google', 'Google Drive')
  add(path.join(home, 'OneDrive'), 'onedrive', 'OneDrive')
  add(path.join(home, 'Dropbox'), 'dropbox', 'Dropbox')
  add(path.join(home, 'iCloud Drive'), 'icloud', 'iCloud Drive')
  add(path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'), 'icloud', 'iCloud Drive')

  // Sin duplicados y con la carpeta que propondríamos dentro de cada nube.
  const seen = new Set()
  return out
    .filter((c) => (seen.has(c.path) ? false : seen.add(c.path)))
    .map((c) => ({ ...c, suggested: path.join(c.path, 'ProLife') }))
}

/** ¿El directorio de trabajo está dentro de una carpeta que se sincroniza sola? */
export function syncInfo(baseDir) {
  const abs = path.resolve(baseDir)
  const root = cloudRoots().find(
    (c) => abs === path.resolve(c.path) || abs.startsWith(path.resolve(c.path) + path.sep)
  )
  return { synced: !!root, provider: root?.provider || null, label: root?.label || null, root: root?.path || null }
}

/** Carpetas que la app garantiza que existen dentro de baseDir. */
export const TREE = ['Universidad', 'Trabajo', 'Tareas', 'Deporte', 'Personal', '.prolife']

export function ensureBase(baseDir) {
  fs.mkdirSync(baseDir, { recursive: true })
  for (const dir of TREE) fs.mkdirSync(path.join(baseDir, dir), { recursive: true })
  return baseDir
}

/**
 * Resuelve una ruta relativa contra baseDir y garantiza que no se escapa fuera.
 * Devuelve la ruta absoluta o lanza.
 */
export function safeJoin(baseDir, rel = '') {
  const clean = String(rel).replace(/^[/\\]+/, '')
  const abs = path.resolve(baseDir, clean)
  const normalizedBase = path.resolve(baseDir)
  if (abs !== normalizedBase && !abs.startsWith(normalizedBase + path.sep)) {
    const err = new Error('Ruta fuera del directorio base')
    err.status = 403
    throw err
  }
  return abs
}
