import fs from 'node:fs'
import path from 'node:path'
import { safeJoin } from './config.js'
import { applyOp, describeOp } from './ops.js'

/** La base de datos es un único JSON dentro del directorio real del usuario. */
export function dbPath(baseDir) {
  return path.join(baseDir, '.prolife', 'db.json')
}

export const SCHEMA = 4

export const DEFAULT_CATEGORIES = [
  { id: 'cat-uni', name: 'Universidad', color: '#3c5a78', area: 'uni' },
  { id: 'cat-work', name: 'Trabajo', color: '#bf3f24', area: 'work' },
  { id: 'cat-sport', name: 'Atletismo', color: '#4f6b4a', area: 'sport' },
  { id: 'cat-health', name: 'Salud', color: '#2f6f6b', area: 'life' },
  { id: 'cat-driving', name: 'Conducir', color: '#a5711b', area: 'life' },
  { id: 'cat-personal', name: 'Personal', color: '#6b4a6b', area: 'life' },
]

export const EMPTY_DB = {
  version: SCHEMA,
  profile: { name: '', course: '2026 / 2027' },
  settings: {
    portalUrl: '',
    portalName: 'Portal universitario',
    termStart: '',
    termEnd: '',
    dailyGoalMin: 300,
    /** Segundos sin actividad del sistema antes de pausar el conteo. */
    idleTimeoutSec: 180,
    /** Los tramos más cortos que esto se descartan al cerrarse. */
    minSegmentSec: 60,
    autoTrack: true,
    theme: 'paper',
    trainingTypes: ['Series', 'Rodaje', 'Gimnasio', 'Técnica', 'Competición', 'Recuperación'],
    weeklyTrainingGoal: 5,
    /** Asistencia mínima exigida por defecto (0–1). Cada asignatura puede pisarla. */
    attendanceMin: 0.7,
    /** Horas de trabajo por semana que cuentan como el 100%. */
    weeklyGoalHours: 25,
    /** Ayudante local: se habla con un Ollama que corre en tu propio ordenador. */
    assistant: {
      enabled: true,
      url: 'http://127.0.0.1:11434',
      model: '',
      /** Deja que el ayudante cree tareas y exámenes por ti. */
      allowWrite: true,
    },
    links: [],
  },
  categories: DEFAULT_CATEGORIES,
  subjects: [],
  projects: [],
  tasks: [],
  /** Exámenes y entregas evaluables de cada asignatura. */
  exams: [],
  attendance: [],
  sessions: [],
  events: [],
  training: [],
  /**
   * Estado del espacio de trabajo por carpeta: qué paneles, pestañas y tamaños
   * tenías abiertos. Vive aquí, y no solo en el navegador, para que viaje con
   * la carpeta sincronizada al otro ordenador.
   */
  workspaces: {},
}

/**
 * v1 → v2: aparecen categorías, entrenamientos y uso de IA; desaparece `sports`.
 * v2 → v3: las IAs empotradas se retiran, llegan los exámenes, el horario deja de
 *          ser eterno (cada clase tiene su rango de fechas) y aparece el ayudante local.
 * v3 → v4: el estado del espacio de trabajo (paneles, pestañas, tamaños) pasa a
 *          guardarse aquí para que viaje entre ordenadores. No toca datos previos.
 */

/** Versión que trae el fichero tal cual está en disco. */
export const versionOf = (raw) => Number(raw?.version) || 1

/**
 * ¿Este fichero lo escribió una versión de prolife más nueva que la nuestra?
 * En ese caso no se migra «hacia abajo» ni se guarda encima: se avisa.
 */
export const isFuture = (raw) => versionOf(raw) > SCHEMA

function migrate(raw) {
  const db = { ...structuredClone(EMPTY_DB), ...raw }
  db.settings = { ...EMPTY_DB.settings, ...(raw.settings || {}) }
  db.settings.assistant = { ...EMPTY_DB.settings.assistant, ...(raw.settings?.assistant || {}) }
  db.profile = { ...EMPTY_DB.profile, ...(raw.profile || {}) }

  if (!Array.isArray(db.categories) || db.categories.length === 0) db.categories = structuredClone(DEFAULT_CATEGORIES)

  for (const key of ['subjects', 'projects', 'tasks', 'exams', 'attendance', 'sessions', 'events', 'training']) {
    if (!Array.isArray(db[key])) db[key] = []
  }

  if ((raw.version || 1) < 2) {
    // Los proyectos pasan de "cliente" a "organización" (RFEA y demás).
    db.projects = db.projects.map((p) => ({ org: p.client || '', ...p }))
    // Los eventos antiguos no tenían categoría ni repetición.
    db.events = db.events.map((e) => ({ categoryId: null, repeat: null, exceptions: [], ...e }))
    // Las actividades deportivas genéricas se convierten en tipos de entrenamiento.
    const names = (raw.sports || []).map((s) => s.name).filter(Boolean)
    if (names.length) db.settings.trainingTypes = [...new Set([...db.settings.trainingTypes, ...names])]
    delete db.sports
  }

  if ((raw.version || 1) < 3) {
    // Las IAs dejan de vivir empotradas, pero sus URLs no se tiran: pasan a enlaces.
    const ai = (raw.settings?.ai || []).filter((a) => a.url)
    if (ai.length) {
      const known = new Set((db.settings.links || []).map((l) => l.url))
      db.settings.links = [
        ...(db.settings.links || []),
        ...ai.filter((a) => !known.has(a.url)).map((a) => ({ id: a.id, name: a.name, url: a.url })),
      ]
    }
  }

  // Ya no se usan: el panel de IAs empotradas desapareció en v3.
  delete db.settings.ai
  delete db.aiUsage

  // Una clase sin rango de fechas duraría hasta el fin de los tiempos.
  db.subjects = db.subjects.map((s) => ({
    weeklyGoalHours: 0,
    attendanceMin: null,
    ...s,
    schedule: (s.schedule || []).map((sl) => ({ from: '', until: '', ...sl })),
  }))

  if (!db.workspaces || typeof db.workspaces !== 'object' || Array.isArray(db.workspaces)) db.workspaces = {}

  // Nunca hacia abajo: si el fichero es de una versión más nueva, se respeta su
  // número. Rebajarlo haría que la próxima app moderna reaplicase migraciones
  // viejas sobre datos que ya no lo son, y eso sí destruye trabajo.
  db.version = Math.max(versionOf(raw), SCHEMA)
  return db
}

/** Lee el JSON crudo del disco, sin migrar. `null` si no hay o no se puede leer. */
export function readRaw(baseDir) {
  try {
    return JSON.parse(fs.readFileSync(dbPath(baseDir), 'utf8'))
  } catch {
    return null
  }
}

/**
 * El layout de un espacio deja de tener sentido en cuanto su carpeta no está:
 * borraste la asignatura, o la renombraste desde el explorador. Nadie leería esa
 * entrada nunca más, pero seguiría engordando el `db.json` que viaja por Drive
 * en cada guardado, con la lista entera de pestañas que tuvo aquel día.
 *
 * El criterio es la carpeta en el disco, no las asignaturas: por la vista
 * Archivos se abren espacios sobre carpetas sueltas (`Deporte`, `Universidad`)
 * que son igual de legítimos y no pertenecen a ninguna entidad.
 */
function pruneWorkspaces(db, baseDir) {
  for (const key of Object.keys(db.workspaces)) {
    try {
      if (fs.statSync(safeJoin(baseDir, key)).isDirectory()) continue
    } catch {
      /* no está, o la ruta ya no es válida */
    }
    delete db.workspaces[key]
  }
  return db
}

export function loadDb(baseDir) {
  const raw = readRaw(baseDir)
  if (!raw) return structuredClone(EMPTY_DB)
  return pruneWorkspaces(migrate(raw), baseDir)
}

export function saveDb(baseDir, data) {
  const disk = readRaw(baseDir)
  if (disk && isFuture(disk)) {
    const err = new Error(
      `El archivo de datos es de una versión más nueva de prolife (v${versionOf(disk)}; esta entiende v${SCHEMA}). ` +
        'Actualiza la app en este ordenador antes de seguir trabajando aquí: guardar ahora podría estropear los datos.'
    )
    err.status = 409
    throw err
  }
  const file = dbPath(baseDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, file)
  return true
}

/* --------------------------------------------------------- buzón de ops --- */

/**
 * El buzón por el que la tablet cambia la base de datos sin tocar el `db.json`.
 *
 * La tablet, cuando habla con Google Drive por su cuenta, no puede escribir el
 * `db.json` entero: lo haría desde su copia y machacaría lo que hubieras hecho
 * en el ordenador entretanto. Lo que hace es dejar ficheros sueltos en
 * `.prolife/ops/`, cada uno con unas pocas operaciones dentro. Drive los
 * sincroniza como cualquier otro archivo —son pequeños y nadie más los toca, así
 * que no hay conflicto posible— y aquí se vacían sobre el `db.json` del momento.
 *
 * Sigue habiendo un solo escritor de la base: este ordenador.
 */
export const opsDir = (baseDir) => path.join(baseDir, '.prolife', 'ops')

/** Una hora de margen antes de dar por perdido un fichero que no se puede leer. */
const PACIENCIA_MS = 3600_000

/**
 * Vacía el buzón sobre la base de datos. Devuelve qué ha entrado y qué no.
 *
 * No lanza nunca: esto corre en el camino de leer los datos, y un fichero raro
 * dejado por una sincronización a medias no puede dejar la app sin abrir.
 */
export function drainOps(baseDir) {
  const dir = opsDir(baseDir)
  let nombres
  try {
    nombres = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  } catch {
    return { applied: 0, skipped: [], files: 0 }
  }
  if (!nombres.length) return { applied: 0, skipped: [], files: 0 }

  const db = loadDb(baseDir)
  const skipped = []
  const hechos = []
  let applied = 0

  for (const nombre of nombres) {
    const file = path.join(dir, nombre)
    let lote
    try {
      lote = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      // Puede ser que Drive lo esté trayendo a medias: se deja para la próxima.
      // Si lleva ahí una hora sin poder leerse, ya no va a arreglarse solo.
      try {
        if (Date.now() - fs.statSync(file).mtimeMs > PACIENCIA_MS) apartar(dir, file, nombre)
      } catch {
        /* ha desaparecido entre medias */
      }
      continue
    }

    const ops = Array.isArray(lote) ? lote : Array.isArray(lote?.ops) ? lote.ops : null
    if (!ops) { apartar(dir, file, nombre); continue }

    for (const op of ops) {
      const error = applyOp(db, op)
      if (error) skipped.push({ file: nombre, que: describeOp(op), error })
      else applied++
    }
    hechos.push(file)
  }

  if (!hechos.length) return { applied: 0, skipped, files: 0 }

  // Guardar ANTES de borrar: si algo falla al escribir, las operaciones siguen
  // en el buzón y se vuelven a intentar. Al revés se perderían.
  saveDb(baseDir, db)
  for (const file of hechos) {
    try {
      fs.rmSync(file, { force: true })
    } catch {
      /* si no se puede borrar, la próxima vez se aplica otra vez: son idempotentes */
    }
  }
  return { applied, skipped, files: hechos.length }
}

/** Lo que no se ha podido aplicar no se tira: se aparta para poder mirarlo. */
function apartar(dir, file, nombre) {
  try {
    const malas = path.join(dir, 'rechazadas')
    fs.mkdirSync(malas, { recursive: true })
    fs.renameSync(file, path.join(malas, nombre))
  } catch {
    /* mejor dejarlo donde está que tumbar el arranque */
  }
}

/** Copia de seguridad diaria, se conservan las 14 últimas. */
export function backupDb(baseDir) {
  const file = dbPath(baseDir)
  if (!fs.existsSync(file)) return
  const dir = path.join(baseDir, '.prolife', 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const target = path.join(dir, `db-${new Date().toISOString().slice(0, 10)}.json`)
  if (!fs.existsSync(target)) fs.copyFileSync(file, target)
  const old = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().slice(0, -14)
  for (const f of old) fs.rmSync(path.join(dir, f), { force: true })
}

/**
 * La copia diaria no puede depender de que reinicies la app: si la dejas abierta
 * una semana, hay que seguir haciéndola. Se comprueba cada hora porque `backupDb`
 * ya es idempotente dentro del mismo día (y así un cambio de día se recoge solo).
 */
export function scheduleBackups(getBaseDir, everyMs = 3600_000) {
  const tick = () => {
    try {
      backupDb(getBaseDir())
    } catch {
      /* un fallo de copia no puede tumbar el servidor */
    }
  }
  tick()
  const timer = setInterval(tick, everyMs)
  timer.unref?.()
  return () => clearInterval(timer)
}
