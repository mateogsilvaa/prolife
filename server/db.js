import fs from 'node:fs'
import path from 'node:path'

/** La base de datos es un único JSON dentro del directorio real del usuario. */
export function dbPath(baseDir) {
  return path.join(baseDir, '.prolife', 'db.json')
}

export const SCHEMA = 3

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
}

/**
 * v1 → v2: aparecen categorías, entrenamientos y uso de IA; desaparece `sports`.
 * v2 → v3: las IAs empotradas se retiran, llegan los exámenes, el horario deja de
 *          ser eterno (cada clase tiene su rango de fechas) y aparece el ayudante local.
 */
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

  db.version = SCHEMA
  return db
}

export function loadDb(baseDir) {
  try {
    return migrate(JSON.parse(fs.readFileSync(dbPath(baseDir), 'utf8')))
  } catch {
    return structuredClone(EMPTY_DB)
  }
}

export function saveDb(baseDir, data) {
  const file = dbPath(baseDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, file)
  return true
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
