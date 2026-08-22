export const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
export const DAYS_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
export const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** YYYY-MM-DD en hora local (nunca uses toISOString, desplaza el día). */
export function iso(d = new Date()) {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export function parseIso(s) {
  const [y, m, d] = String(s).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export const today = () => iso()

/** 0 = lunes … 6 = domingo */
export const weekday = (d) => (new Date(d).getDay() + 6) % 7

export function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Lunes de la semana de `d`. */
export function startOfWeek(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return addDays(x, -weekday(x))
}

export function weekKey(d = new Date()) {
  return iso(startOfWeek(d))
}

export function weekRange(monday) {
  const start = new Date(monday)
  const end = addDays(start, 6)
  return { start: iso(start), end: iso(end) }
}

export function weekLabel(monday) {
  const s = parseIso(iso(monday))
  const e = addDays(s, 6)
  const sm = MONTHS[s.getMonth()].slice(0, 3).toLowerCase()
  const em = MONTHS[e.getMonth()].slice(0, 3).toLowerCase()
  return s.getMonth() === e.getMonth()
    ? `${s.getDate()} – ${e.getDate()} ${em}`
    : `${s.getDate()} ${sm} – ${e.getDate()} ${em}`
}

export function fmtDate(s, opts = {}) {
  if (!s) return ''
  const d = parseIso(s)
  const t = parseIso(today())
  const diff = Math.round((d - t) / 86400000)
  if (!opts.absolute) {
    if (diff === 0) return 'hoy'
    if (diff === 1) return 'mañana'
    if (diff === -1) return 'ayer'
    if (diff > 1 && diff < 7) return DAYS_LONG[weekday(d)].toLowerCase()
    if (diff < 0 && diff > -7) return `hace ${-diff} días`
  }
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3).toLowerCase()}${
    d.getFullYear() !== t.getFullYear() ? ` ${d.getFullYear()}` : ''
  }`
}

export function daysUntil(s) {
  return Math.round((parseIso(s) - parseIso(today())) / 86400000)
}

/** 5400 → "1h 30m" */
export function dur(sec, long) {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (long) {
    if (h && m) return `${h} h ${m} min`
    if (h) return `${h} h`
    return `${m} min`
  }
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  if (m) return `${m}m`
  return `${s}s`
}

export function clock(sec) {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`
}

export function monthMatrix(year, month) {
  const first = new Date(year, month, 1)
  const start = startOfWeek(first)
  const cells = []
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i)
    cells.push({ date: iso(d), day: d.getDate(), out: d.getMonth() !== month })
    if (i >= 34 && d.getMonth() !== month && (i + 1) % 7 === 0) break
  }
  return cells
}
