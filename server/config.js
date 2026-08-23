import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
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
  /**
   * Con esto en falso el servidor solo escucha en 127.0.0.1 y nadie más puede
   * verlo. Al activarlo escucha en toda la red, que es lo que permite abrir la
   * app desde la tablet — y por eso entonces hace falta la clave.
   */
  remote: false,
  /** Clave de acceso para todo lo que no venga del propio ordenador. */
  token: '',
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

/** Lo que hay escrito en disco, sin defectos ni la variable de entorno. */
function storedConfig() {
  for (const file of [CONFIG_FILE, LEGACY_CONFIG]) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      /* siguiente */
    }
  }
  return {}
}

export function writeConfig(patch) {
  // Se parte de lo guardado, no de `readConfig()`: si no, abrir la app con
  // PROLIFE_DIR y tocar cualquier ajuste dejaría ese directorio grabado para
  // siempre, y lo que promete esa variable es justo lo contrario.
  const stored = { ...storedConfig(), ...patch }
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(stored, null, 2), 'utf8')
  return { ...DEFAULTS, ...stored, ...OVERRIDE }
}

/**
 * La clave se crea sola la primera vez que hace falta y se guarda junto al
 * resto de la configuración, en el home: no viaja con la carpeta sincronizada,
 * así que cada ordenador tiene la suya.
 */
export const newToken = () => crypto.randomBytes(24).toString('base64url')

export function ensureToken() {
  const cfg = readConfig()
  return cfg.token || writeConfig({ token: newToken() }).token
}

/** Comparación en tiempo constante: una clave no se compara con `===`. */
export function tokenMatches(given, expected) {
  if (!expected) return false
  const a = Buffer.from(String(given || ''))
  const b = Buffer.from(String(expected))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * Direcciones por las que este ordenador es alcanzable desde otro aparato.
 * Las de Tailscale (100.64.0.0/10) se marcan aparte: son las que siguen valiendo
 * fuera de casa, que es justo el caso de la tablet en la universidad.
 */
export function lanAddresses() {
  const out = []
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.internal || net.family !== 'IPv4') continue
      const [a, b] = net.address.split('.').map(Number)
      const vpn = a === 100 && b >= 64 && b <= 127
      out.push({ address: net.address, iface: name, vpn })
    }
  }
  // Primero las que funcionan desde fuera.
  return out.sort((x, y) => Number(y.vpn) - Number(x.vpn))
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
