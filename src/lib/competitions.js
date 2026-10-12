import { today, parseIso, iso, addDays } from './date.js'
import { dailyTable } from './correlations.js'
import { wellnessOn, bbDe, hrs } from './health.js'

/**
 * Competiciones y marcas.
 *
 * Una competición (`db.competitions`) es un día y un sitio; dentro van las
 * pruebas que hiciste, cada una con su marca. De ahí salen la mejor marca
 * personal (MMP) y la de la temporada (MMT) de cada prueba, su progresión y
 * con qué llegabas a cada una: sueño, Body Battery, carga y CMJ.
 */

export const EVENTS = [
  '60m', '100m', '200m', '300m', '400m', '500m', '600m', '800m', '1000m', '1500m', '3000m', '5000m', '10000m',
  '60m vallas', '100m vallas', '110m vallas', '300m vallas', '400m vallas', '2000m obstáculos', '3000m obstáculos',
  'Longitud', 'Triple', 'Altura', 'Pértiga', 'Peso', 'Disco', 'Jabalina', 'Martillo',
  '4x100', '4x400', 'Cross', '5K ruta', '10K ruta', 'Media maratón',
]

/** Saltos y lanzamientos se miden en metros y gana el que más; el resto, en tiempo. */
export const isField = (event) => /longitud|triple|altura|p[eé]rtiga|peso|disco|jabalina|martillo|salto|lanz/i.test(event || '')
/** En estas pruebas el viento cuenta: con más de +2,0 m/s la marca no vale como récord. */
export const windMatters = (event) => /^(60m|100m|200m|100m vallas|110m vallas|longitud|triple)$/i.test(String(event || '').trim())

/** «7.12» → 7.12 · «1:58.34» → 118.34 · «6,45» → 6.45 */
export function parseMark(event, txt) {
  const s = String(txt ?? '').trim().replace(',', '.').replace(/[″"]/g, '').replace(/[′']/g, ':').replace(/\s*m$/i, '')
  if (!s) return null
  if (isField(event)) {
    const v = Number(s)
    return Number.isFinite(v) && v > 0 ? v : null
  }
  const parts = s.split(':').map(Number)
  if (parts.some((x) => !Number.isFinite(x))) return null
  const v = parts.reduce((a, x) => a * 60 + x, 0)
  return v > 0 ? v : null
}

export function fmtMark(event, v) {
  if (v == null) return '—'
  if (isField(event)) return `${v.toFixed(2).replace('.', ',')} m`
  if (v < 60) return v.toFixed(2).replace('.', ',')
  const h = Math.floor(v / 3600)
  const m = Math.floor((v % 3600) / 60)
  const sec = v - h * 3600 - m * 60
  const ss = sec.toFixed(sec % 1 ? 2 : 0).replace('.', ',').padStart(sec % 1 ? 5 : 2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** ¿`a` es mejor que `b` en esta prueba? */
export const better = (event, a, b) => (b == null ? true : isField(event) ? a > b : a < b)

export const newCompetition = (patch = {}) => ({
  id: `comp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  name: '', date: today(), time: '', place: '', indoor: false, notes: '', results: [], ...patch,
})

/** Todas las marcas, de la más reciente a la más antigua, con su competición. */
export function allResults(db) {
  const out = []
  for (const c of db.competitions || []) {
    for (const r of c.results || []) {
      const v = parseMark(r.event, r.mark)
      out.push({ ...r, value: v, comp: c, date: c.date, indoor: !!c.indoor, ventoso: windMatters(r.event) && Number(String(r.wind || '').replace(',', '.')) > 2 })
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Mejor marca personal y de la temporada por prueba. Las marcas con viento de
 * más de +2,0 se enseñan pero no cuentan como récord.
 */
export function personalBests(db) {
  const anio = today().slice(0, 4)
  const m = new Map()
  for (const r of [...allResults(db)].reverse()) {
    if (r.value == null) continue
    const x = m.get(r.event) || { event: r.event, pb: null, sb: null, n: 0, last: null, history: [] }
    x.n++
    x.last = r
    x.history.push({ date: r.date, value: r.value, ventoso: r.ventoso, indoor: r.indoor })
    if (!r.ventoso && better(r.event, r.value, x.pb?.value)) x.pb = r
    if (!r.ventoso && r.date.startsWith(anio) && better(r.event, r.value, x.sb?.value)) x.sb = r
    m.set(r.event, x)
  }
  return [...m.values()].sort((a, b) => b.n - a.n)
}

/** ¿Esta marca fue MMP en su momento? (mejor que todo lo anterior) */
export function wasPB(db, r) {
  if (r.value == null || r.ventoso) return false
  return !allResults(db).some((o) => o.event === r.event && o.date < r.date && o.value != null && !o.ventoso && !better(r.event, r.value, o.value))
}

/**
 * Con qué llegaste a una competición: la noche anterior, la Body Battery, la
 * carga de las semanas previas (si bajaste para competir) y tu último CMJ.
 */
export function arrival(db, date, tabla = dailyTable(db, 400)) {
  const i = tabla.findIndex((f) => f.date === date)
  const w = wellnessOn(db, date)
  const fila = i >= 0 ? tabla[i] : null
  const cmjs = tabla.slice(Math.max(0, i - 7), i + 1).map((f) => f.cmjPre).filter((v) => v != null)
  return {
    sueno: w?.sleep?.seconds ? w.sleep.seconds / 3600 : null,
    bb: bbDe(w)?.wake ?? null,
    reposo: w?.restingHr ?? null,
    acwr: fila?.acwr ?? null,
    cmj: cmjs.length ? cmjs[cmjs.length - 1] : null,
  }
}

/**
 * Qué influye en tus marcas. Cada marca se pasa a «% respecto a tu mejor marca
 * de esa prueba» (así se pueden mezclar el 60 y la longitud) y se cruza con
 * cómo llegabas. Con menos de 5 marcas no se dice nada.
 */
export function whatInfluences(db) {
  const tabla = dailyTable(db, 400)
  const pbs = new Map(personalBests(db).map((p) => [p.event, p.pb?.value]))
  const filas = []
  for (const r of allResults(db)) {
    const pb = pbs.get(r.event)
    if (r.value == null || !pb) continue
    const rendimiento = isField(r.event) ? (r.value / pb) * 100 : (pb / r.value) * 100
    filas.push({ rendimiento, ...arrival(db, r.date, tabla) })
  }
  const factores = [
    ['sueno', 'las horas de sueño de la noche anterior', (v) => hrs(v * 3600)],
    ['bb', 'la Body Battery al despertar', (v) => v.toFixed(0)],
    ['acwr', 'la carga de la última semana frente a tu habitual', (v) => v.toFixed(2)],
    ['cmj', 'tu último CMJ', (v) => `${v.toFixed(1)} cm`],
  ]
  const out = []
  for (const [k, nombre, fmt] of factores) {
    const pares = filas.filter((f) => f[k] != null).map((f) => [f[k], f.rendimiento])
    if (pares.length < 5) { out.push({ k, nombre, n: pares.length }); continue }
    const orden = [...pares].sort((a, b) => a[0] - b[0])
    const t = Math.max(2, Math.floor(orden.length / 3))
    const bajos = orden.slice(0, t)
    const altos = orden.slice(-t)
    const med = (xs) => xs.reduce((a, p) => a + p[1], 0) / xs.length
    out.push({
      k, nombre, n: pares.length,
      altoDesde: fmt(altos[0][0]), bajoHasta: fmt(bajos[bajos.length - 1][0]),
      rendAlto: med(altos), rendBajo: med(bajos),
    })
  }
  return { n: filas.length, factores: out }
}

/** Las próximas competiciones, con los días que faltan. */
export function upcoming(db, dias = 60) {
  const hoy = today()
  const limite = iso(addDays(parseIso(hoy), dias))
  return (db.competitions || []).filter((c) => c.date >= hoy && c.date <= limite)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((c) => ({ ...c, dias: Math.round((parseIso(c.date) - parseIso(hoy)) / 86400000) }))
}
