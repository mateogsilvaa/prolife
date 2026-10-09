import { iso, addDays, startOfWeek, parseIso, weekday, today } from './date.js'
import { PALETTE } from './store.jsx'

/**
 * Todo lo que se puede contar de los entrenos, en un solo sitio.
 *
 * Lo usan tres pantallas —Atletismo, Estadísticas y el informe que se exporta
 * desde Ajustes— y por eso vive aquí: si cada una contara a su manera, el día
 * que no coincidieran no habría forma de saber cuál tiene razón.
 */

export const RPE_COLOR = (v) =>
  v <= 3 ? 'var(--green)' : v <= 5 ? '#7d9a5e' : v <= 7 ? 'var(--amber)' : v <= 9 ? '#c4622a' : 'var(--accent)'

/** Carga de sesión = RPE × minutos. Es la métrica estándar de carga interna. */
export const loadOf = (t) => (t.done ? (Number(t.rpe) || 0) * (Number(t.minutes) || 0) : 0)

/** Un color fijo por tipo de entreno, el mismo en el calendario y en las gráficas. */
export function typeColor(db, type) {
  const types = db.settings.trainingTypes || []
  const i = types.indexOf(type)
  return PALETTE[(i < 0 ? types.length : i) % PALETTE.length]
}

/* ---------------------------------------------------------------- molestias */

/** Dónde duele. Lo bastante fino para ver patrones, sin ser un atlas de anatomía. */
export const ZONES = [
  'Pie / planta', 'Tobillo', 'Aquiles', 'Gemelo / sóleo', 'Tibia (periostitis)', 'Rodilla',
  'Isquiotibial', 'Cuádriceps', 'Aductor / ingle', 'Cadera', 'Glúteo', 'Lumbar',
  'Espalda alta', 'Hombro', 'Cuello', 'Otra',
]

export const SIDES = [
  { id: 'izq', label: 'Izquierda' },
  { id: 'der', label: 'Derecha' },
  { id: 'ambos', label: 'Las dos' },
  { id: '', label: 'Centro / no aplica' },
]

/**
 * Tres escalones, que son las tres decisiones que importan: «lo noto», «me
 * condiciona el entreno» y «esto es una lesión y hay que parar». La intensidad
 * del 1 al 10 va aparte, porque una molestia puede doler mucho y no ser lesión.
 */
export const PAIN_KINDS = [
  { id: 'molestia', label: 'Molestia', hint: 'la noto, pero entreno normal' },
  { id: 'dolor', label: 'Dolor', hint: 'me condiciona o he tenido que bajar' },
  { id: 'lesion', label: 'Lesión', hint: 'he tenido que parar' },
]

export const PAIN_WHEN = [
  { id: 'antes', label: 'Antes' },
  { id: 'durante', label: 'Durante' },
  { id: 'despues', label: 'Después' },
  { id: 'dia-siguiente', label: 'Al día siguiente' },
]

export const sideLabel = (s) => SIDES.find((x) => x.id === s)?.label || ''
export const kindLabel = (k) => PAIN_KINDS.find((x) => x.id === k)?.label || 'Molestia'
export const whereLabel = (p) => `${p.zone || 'Sin zona'}${p.side && p.side !== '' ? ` (${sideLabel(p.side).toLowerCase()})` : ''}`

export const PAIN_COLOR = (level) =>
  level <= 3 ? 'var(--amber)' : level <= 6 ? '#c4622a' : 'var(--accent)'

export const newPain = () => ({ zone: '', side: '', level: 3, kind: 'molestia', when: 'durante', stopped: false, notes: '' })

/** Todas las molestias apuntadas, cada una con la fecha del entreno en el que salió. */
export function allPains(db) {
  const out = []
  for (const t of db.training || []) {
    for (const p of t.pains || []) out.push({ ...p, date: t.date, trainingId: t.id, type: t.done ? t.type : 'Descanso' })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

/** Lesiones abiertas: las que no tienen fecha de alta. */
export const activeInjuries = (db) =>
  (db.injuries || []).filter((i) => !i.to).sort((a, b) => a.from.localeCompare(b.from))

export const injuryDays = (inj) =>
  Math.max(0, Math.round((parseIso(inj.to || today()) - parseIso(inj.from)) / 86400000))

/** «desde hoy», «desde ayer», «desde hace 12 días». */
export const injuryAge = (inj) => {
  const n = injuryDays(inj)
  return n === 0 ? 'desde hoy' : n === 1 ? 'desde ayer' : `desde hace ${n} días`
}

/** «miércoles, 7 de octubre» → «Miércoles, 7 de octubre». */
export const longDate = (d) => {
  const s = parseIso(d).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Lo que dicen las molestias juntas: qué zona se repite, con qué intensidad y
 * si va a más. Una molestia suelta no dice nada; la misma rodilla tres semanas
 * seguidas sí.
 */
export function painSummary(db, days = 90) {
  const desde = iso(addDays(new Date(), -days))
  const pains = allPains(db).filter((p) => p.date >= desde)
  const byZone = new Map()
  for (const p of pains) {
    const k = whereLabel(p)
    const z = byZone.get(k) || { where: k, zone: p.zone, side: p.side, n: 0, sum: 0, max: 0, last: p.date, first: p.date, lesion: 0, recent: [] }
    z.n++
    z.sum += Number(p.level) || 0
    z.max = Math.max(z.max, Number(p.level) || 0)
    if (p.date > z.last) z.last = p.date
    if (p.date < z.first) z.first = p.date
    if (p.kind === 'lesion') z.lesion++
    z.recent.push({ date: p.date, level: Number(p.level) || 0 })
    byZone.set(k, z)
  }
  const zones = [...byZone.values()]
    .map((z) => {
      const ord = z.recent.sort((a, b) => a.date.localeCompare(b.date))
      const mitad = Math.floor(ord.length / 2)
      const media = (xs) => (xs.length ? xs.reduce((a, x) => a + x.level, 0) / xs.length : 0)
      // Con tres apuntes o más se puede decir hacia dónde va: la segunda mitad
      // contra la primera. Con menos, cualquier «tendencia» sería inventada.
      const trend = ord.length >= 3 ? media(ord.slice(mitad)) - media(ord.slice(0, mitad)) : null
      return { ...z, avg: z.sum / z.n, trend }
    })
    .sort((a, b) => b.n - a.n || b.avg - a.avg)

  const sessions = (db.training || []).filter((t) => t.date >= desde && t.done)
  const withPain = sessions.filter((t) => (t.pains || []).length).length
  return { pains, zones, sessions: sessions.length, withPain, days }
}

/* ------------------------------------------------------------ estadísticas */

/** Todo lo numérico de los entrenos: por tipo, por día de la semana, por mes, rachas. */
export function trainingStats(db) {
  const all = [...(db.training || [])].sort((a, b) => a.date.localeCompare(b.date))
  const done = all.filter((t) => t.done)
  const goal = db.settings.weeklyTrainingGoal || 5

  const types = new Map()
  for (const t of done) {
    const k = t.type || 'Sin tipo'
    const x = types.get(k) || { type: k, n: 0, minutes: 0, rpe: 0, load: 0, last: '', byWeekday: Array(7).fill(0) }
    x.n++
    x.minutes += Number(t.minutes) || 0
    x.rpe += Number(t.rpe) || 0
    x.load += loadOf(t)
    x.byWeekday[weekday(parseIso(t.date))]++
    if (t.date > x.last) x.last = t.date
    types.set(k, x)
  }
  const byType = [...types.values()]
    .map((x) => ({ ...x, avgRpe: x.n ? x.rpe / x.n : 0, avgMin: x.n ? x.minutes / x.n : 0 }))
    .sort((a, b) => b.n - a.n)

  const byWeekday = Array(7).fill(0)
  const minByWeekday = Array(7).fill(0)
  for (const t of done) {
    const wd = weekday(parseIso(t.date))
    byWeekday[wd]++
    minByWeekday[wd] += Number(t.minutes) || 0
  }

  // Los últimos 12 meses, incluido el actual, aunque estén vacíos: un hueco en
  // la gráfica también es información.
  const now = new Date()
  const months = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const list = done.filter((t) => t.date.startsWith(key))
    months.push({
      key, month: d.getMonth(), year: d.getFullYear(),
      n: list.length,
      minutes: list.reduce((a, t) => a + (Number(t.minutes) || 0), 0),
      load: list.reduce((a, t) => a + loadOf(t), 0),
    })
  }

  // Semanas: cuántas seguidas has cumplido el objetivo, y la mejor racha.
  const base = startOfWeek(now)
  const weeks = []
  const first = done[0] ? startOfWeek(parseIso(done[0].date)) : base
  for (let d = first; d <= base; d = addDays(d, 7)) {
    const start = iso(d)
    const end = iso(addDays(d, 6))
    const n = done.filter((t) => t.date >= start && t.date <= end).length
    weeks.push({ start, n })
  }
  let best = 0
  let run = 0
  for (const w of weeks) {
    run = w.n >= goal ? run + 1 : 0
    best = Math.max(best, run)
  }
  // La racha actual no se rompe por la semana en curso, que todavía no ha acabado.
  let current = 0
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].n >= goal) current++
    else if (i === weeks.length - 1) continue
    else break
  }
  const last12 = weeks.slice(-13, -1)
  const adherence = last12.length ? last12.filter((w) => w.n >= goal).length / last12.length : null
  const bestWeek = weeks.reduce((a, w) => (w.n > a.n ? w : a), { n: 0, start: '' })

  // Días seguidos entrenando (el de hoy puede no estar apuntado todavía).
  let streakDays = 0
  const dates = new Set(done.map((t) => t.date))
  for (let i = dates.has(today()) ? 0 : 1; i < 400; i++) {
    if (dates.has(iso(addDays(now, -i)))) streakDays++
    else break
  }

  const lastDone = done[done.length - 1] || null
  const year = String(now.getFullYear())
  const monthKey = iso(now).slice(0, 7)
  return {
    total: done.length,
    rest: all.length - done.length,
    minutes: done.reduce((a, t) => a + (Number(t.minutes) || 0), 0),
    load: done.reduce((a, t) => a + loadOf(t), 0),
    avgRpe: done.length ? done.reduce((a, t) => a + (Number(t.rpe) || 0), 0) / done.length : 0,
    avgMin: done.length ? done.reduce((a, t) => a + (Number(t.minutes) || 0), 0) / done.length : 0,
    thisYear: done.filter((t) => t.date.startsWith(year)).length,
    thisMonth: done.filter((t) => t.date.startsWith(monthKey)).length,
    byType, byWeekday, minByWeekday, months, weeks,
    bestStreak: best, currentStreak: current, adherence, bestWeek, streakDays,
    lastDone,
    daysSinceLast: lastDone ? Math.round((parseIso(today()) - parseIso(lastDone.date)) / 86400000) : null,
    favDay: byWeekday.some((x) => x) ? byWeekday.indexOf(Math.max(...byWeekday)) : null,
    hardest: done.reduce((a, t) => (!a || loadOf(t) > loadOf(a) ? t : a), null),
    longest: done.reduce((a, t) => (!a || (Number(t.minutes) || 0) > (Number(a.minutes) || 0) ? t : a), null),
    cmj: done.filter((t) => t.cmjPre).map((t) => ({ date: t.date, pre: Number(t.cmjPre), post: Number(t.cmjPost) || null })),
  }
}
