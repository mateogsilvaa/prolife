import { uid } from './store.jsx'
import { parseIso } from './date.js'

/**
 * Gimnasio y series de pista.
 *
 * Rutina (`db.routines`): { id, name, source, createdAt, days: [{ id, name,
 *   exercises: [{ id, name, sets, reps, rest, notes }] }] }
 *
 * Sesión de gimnasio (`training[].gym`): { routineId, dayId, exercises: [{
 *   key, name, target, skipped, notes, sets: [{ kg, reps, warmup }] }] }
 *
 * Series (`training[].reps`): [{ dist, time, rest, note }], con la distancia
 * en metros y el tiempo como se teclea («48.2», «1:05.3»).
 */

/* ----------------------------------------------------------- utilidades -- */

/** Clave estable de un ejercicio: así «Press Banca» y «press banca » son el mismo. */
export const exKey = (name) =>
  String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

const n = (v) => {
  const x = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(x) ? x : null
}

/** 1RM estimado (Epley). Con más de 12 repeticiones deja de ser fiable, así que se corta ahí. */
export const e1rm = (kg, reps) => {
  const w = n(kg)
  const r = n(reps)
  if (!w || !r || r <= 0) return null
  return r === 1 ? w : w * (1 + Math.min(r, 12) / 30)
}

export const workSets = (ex) => (ex.sets || []).filter((s) => !s.warmup && n(s.reps) > 0)

/** «48.2» → 48.2 · «1:05.3» → 65.3 · «2'05"» → 125 */
export function parseTime(t) {
  const s = String(t ?? '').trim().replace(/[″"]/g, '').replace(/[′']/g, ':').replace(',', '.')
  if (!s) return null
  const parts = s.split(':').map(Number)
  if (parts.some((x) => !Number.isFinite(x))) return null
  return parts.reduce((a, x) => a * 60 + x, 0)
}

export const fmtTime = (sec) => {
  if (sec == null) return '—'
  if (sec < 60) return sec.toFixed(1).replace('.', ',')
  const m = Math.floor(sec / 60)
  const r = sec - m * 60
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1).replace('.', ',')}`
}

export const paceOf = (dist, sec) => {
  if (!dist || !sec) return null
  const s = (sec / dist) * 1000
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} /km`
}

export const isGymType = (type) => /gim|gym|fuerza|pesas/i.test(type || '')
export const isTrackType = (type) => /serie|pista|t[eé]cnica|compet|interval/i.test(type || '')

/* -------------------------------------------------- de un PDF a una rutina -- */

/**
 * Convierte el texto de un PDF de rutina en una rutina estructurada.
 *
 * Los PDF de rutinas no siguen ningún formato, así que esto es una lectura
 * razonable y nada más: después se enseña para revisarla y corregirla antes de
 * guardarla. Reconoce:
 *  - días: «Día 1», «Día A», «Lunes», «Sesión 2», «Pierna», «Torso», «Push»…
 *  - ejercicios con «4x8», «4 x 8-10», «4 series de 8», «3 sets of 12»,
 *    o en columnas: «Sentadilla   4   8-10   90"»
 *  - descanso («90"», «2'», «90 s», «descanso 2 min») y notas (RIR, RPE, tempo).
 */
const DIA = /^(d[ií]a|day|sesi[oó]n|session|entreno|workout|semana|week|rutina)\s*[\w\d]*\b|^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b|^(pierna|piernas|torso|tor[sz]o|empuje|tir[oó]n|push|pull|legs|upper|lower|full\s*body|fullbody|espalda|pecho|hombro|hombros|brazos?|gl[uú]teos?|core|abdominales?)\b/i
const SXR = /(\d{1,2})\s*(?:x|×|\*|X)\s*(\d{1,3}(?:\s*[-–\/]\s*\d{1,3})?|al fallo|fallo|amrap|m[aá]x)/i
const SERIES_DE = /(\d{1,2})\s*(?:series|sets?|rondas?)\s*(?:de|of|x)?\s*(\d{1,3}(?:\s*[-–\/]\s*\d{1,3})?)\s*(?:reps?|repeticiones)?/i
const COLUMNAS = /^(.*?[a-záéíóúñ].*?)\s{1,}(\d{1,2})\s+(\d{1,3}(?:\s*[-–\/]\s*\d{1,3})?)(?:\s+(.*))?$/i
const DESCANSO = /(?:desc(?:anso)?|rest)?\s*:?\s*(\d{1,3})\s*(″|"|''|s\b|seg|segundos|'|′|min|minutos)/i

const limpiarNombre = (s) =>
  s.replace(/^[\s\-–•·*\d.)]+/, '').replace(/[:\-–|]+$/, '').replace(/\s{2,}/g, ' ').trim()

function descansoDe(texto) {
  const m = texto.match(DESCANSO)
  if (!m) return ''
  const v = Number(m[1])
  return /min|'|′/.test(m[2]) ? `${v}'` : `${v}"`
}

export function parseRoutineText(texto, nombre = 'Rutina') {
  const lineas = String(texto || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\t/g, '  ').replace(/\s+$/, ''))
    .filter((l) => l.trim())

  const days = []
  let dia = null
  let ultimo = null
  const nuevoDia = (name) => {
    dia = { id: uid('rd'), name: name.slice(0, 60), exercises: [] }
    days.push(dia)
    ultimo = null
  }

  for (const cruda of lineas) {
    const l = cruda.trim()
    let m = l.match(SXR)
    let nombreEj = null
    let sets = null
    let reps = null
    let resto = ''

    if (m) {
      nombreEj = limpiarNombre(l.slice(0, m.index))
      sets = Number(m[1])
      reps = m[2].replace(/\s*([-–\/])\s*/g, '$1')
      resto = l.slice(m.index + m[0].length)
      // «4x8 Sentadilla»: el nombre va detrás.
      if (!/[a-záéíóúñ]{3}/i.test(nombreEj)) {
        nombreEj = limpiarNombre(resto.replace(DESCANSO, '').split(/[|(;]/)[0])
        resto = resto.slice(nombreEj.length)
      }
    } else if ((m = l.match(SERIES_DE))) {
      nombreEj = limpiarNombre(l.slice(0, m.index))
      sets = Number(m[1])
      reps = m[2].replace(/\s*([-–\/])\s*/g, '$1')
      resto = l.slice(m.index + m[0].length)
    } else if ((m = l.match(COLUMNAS)) && Number(m[2]) <= 10) {
      nombreEj = limpiarNombre(m[1])
      sets = Number(m[2])
      reps = m[3].replace(/\s*([-–\/])\s*/g, '$1')
      resto = m[4] || ''
    }

    if (nombreEj && /[a-záéíóúñ]{3}/i.test(nombreEj) && sets) {
      if (!dia) nuevoDia(nombre)
      ultimo = {
        id: uid('re'),
        name: nombreEj.slice(0, 80),
        sets,
        reps,
        rest: descansoDe(resto),
        notes: resto.replace(DESCANSO, '').replace(/^[\s,;|\-–]+|[\s,;|\-–]+$/g, '').slice(0, 120),
      }
      dia.exercises.push(ultimo)
      continue
    }

    // Una línea corta que parece un título es un día nuevo.
    const corta = l.length <= 48 && !/\d{2,}\s*(kg|%)/i.test(l)
    if (corta && (DIA.test(l) || (/^[A-ZÁÉÍÓÚÑ0-9 :\-–]{4,}$/.test(l) && /[A-ZÁÉÍÓÚÑ]{3}/.test(l)))) {
      nuevoDia(limpiarNombre(l) || `Día ${days.length + 1}`)
      continue
    }

    // Lo demás, si va justo detrás de un ejercicio, son sus notas (tempo, RIR, técnica).
    if (ultimo && l.length <= 140) {
      ultimo.notes = [ultimo.notes, l].filter(Boolean).join(' · ').slice(0, 200)
      if (!ultimo.rest) ultimo.rest = descansoDe(l)
    }
  }

  return {
    id: uid('rut'),
    name: nombre,
    createdAt: Date.now(),
    days: days.filter((d) => d.exercises.length),
  }
}

/** Saca el texto de un PDF en el propio navegador, línea a línea (sirve en el ordenador, la tablet y la web). */
export async function pdfToText(file) {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const out = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const { items } = await page.getTextContent()
    // Se agrupan los trozos por altura para rehacer las líneas, y dentro de
    // cada línea por posición horizontal: las tablas salen como columnas
    // separadas por espacios, que es lo que entiende `parseRoutineText`.
    const filas = new Map()
    for (const it of items) {
      if (!it.str?.trim()) continue
      const y = Math.round(it.transform[5] / 3)
      const fila = filas.get(y) || []
      fila.push({ x: it.transform[4], s: it.str })
      filas.set(y, fila)
    }
    for (const y of [...filas.keys()].sort((a, b) => b - a)) {
      out.push(filas.get(y).sort((a, b) => a.x - b.x).map((t) => t.s.trim()).join('   '))
    }
  }
  return out.join('\n')
}

/* ----------------------------------------------------- sesión de gimnasio -- */

/** La última vez que se hizo un ejercicio, para enseñarlo al lado y proponer los pesos. */
export function lastTimeOf(db, key, antesDe) {
  const ses = (db.training || [])
    .filter((t) => t.gym && (!antesDe || t.date < antesDe))
    .sort((a, b) => b.date.localeCompare(a.date))
  for (const t of ses) {
    const ex = t.gym.exercises?.find((e) => e.key === key && !e.skipped && workSets(e).length)
    if (ex) return { date: t.date, sets: ex.sets }
  }
  return null
}

/** Las series de una sesión nueva a partir del día de la rutina, con los pesos de la última vez. */
export function sessionFromDay(db, routine, day, date) {
  return {
    routineId: routine.id,
    dayId: day.id,
    exercises: day.exercises.map((e) => {
      const key = exKey(e.name)
      const prev = lastTimeOf(db, key, date)
      const prevWork = prev ? prev.sets.filter((s) => !s.warmup) : []
      const nSets = Number(e.sets) || prevWork.length || 3
      const repsObjetivo = String(e.reps || '').split(/[-–\/]/)[0]
      return {
        key, name: e.name, target: `${e.sets || '?'}×${e.reps || '?'}${e.rest ? ` · ${e.rest}` : ''}`,
        notes: '', skipped: false, routineNotes: e.notes || '',
        load: e.load || '', tempo: e.tempo || '', video: e.video || '', material: e.material || '', block: e.block || '',
        sets: Array.from({ length: nSets }, (_, i) => ({
          kg: prevWork[i]?.kg ?? prevWork[prevWork.length - 1]?.kg ?? '',
          reps: /^\d+$/.test(repsObjetivo) ? repsObjetivo : '',
          warmup: false,
        })),
      }
    }),
  }
}

export function gymVolume(gym) {
  let v = 0
  for (const e of gym?.exercises || []) {
    if (e.skipped) continue
    for (const s of workSets(e)) v += (n(s.kg) || 0) * (n(s.reps) || 0)
  }
  return v
}

/* --------------------------------------------------------- marcas y stats -- */

/** Marcas por ejercicio: peso máximo, 1RM estimado, mejor volumen y su evolución. */
export function gymPRs(db) {
  const m = new Map()
  const sesiones = (db.training || []).filter((t) => t.gym).sort((a, b) => a.date.localeCompare(b.date))
  for (const t of sesiones) {
    for (const e of t.gym.exercises || []) {
      if (e.skipped) continue
      const sets = workSets(e)
      if (!sets.length) continue
      const x = m.get(e.key) || { key: e.key, name: e.name, sessions: 0, maxKg: 0, maxKgDate: '', maxKgReps: 0, best1rm: 0, best1rmDate: '', bestVol: 0, history: [], last: '' }
      x.sessions++
      x.last = t.date
      x.name = e.name
      let top1 = 0
      let vol = 0
      for (const s of sets) {
        const kg = n(s.kg) || 0
        const r = n(s.reps) || 0
        vol += kg * r
        if (kg > x.maxKg || (kg === x.maxKg && r > x.maxKgReps)) { x.maxKg = kg; x.maxKgReps = r; x.maxKgDate = t.date }
        const est = e1rm(kg, r) || 0
        if (est > top1) top1 = est
      }
      if (top1 > x.best1rm) { x.best1rm = top1; x.best1rmDate = t.date }
      x.bestVol = Math.max(x.bestVol, vol)
      x.history.push({ date: t.date, e1rm: top1, vol, top: Math.max(...sets.map((s) => n(s.kg) || 0)) })
      m.set(e.key, x)
    }
  }
  // Sin peso (peso corporal, isométricos, saltos) no hay marca de kilos que comparar.
  return [...m.values()].filter((x) => x.maxKg > 0).sort((a, b) => b.sessions - a.sessions || b.best1rm - a.best1rm)
}

/** ¿Este set es una marca personal respecto a todo lo anterior a esa fecha? */
export function isPR(db, key, date, kg, reps) {
  const est = e1rm(kg, reps)
  if (!est) return false
  for (const t of db.training || []) {
    if (!t.gym || t.date >= date) continue
    for (const e of t.gym.exercises || []) {
      if (e.key !== key || e.skipped) continue
      for (const s of workSets(e)) if ((e1rm(s.kg, s.reps) || 0) >= est) return false
    }
  }
  return true
}

/** Marcas por distancia en las series: mejor tiempo, media y evolución. */
export function trackPRs(db) {
  const m = new Map()
  const sesiones = (db.training || []).filter((t) => (t.reps || []).length).sort((a, b) => a.date.localeCompare(b.date))
  for (const t of sesiones) {
    const porDist = new Map()
    for (const r of t.reps) {
      const d = n(r.dist)
      const s = parseTime(r.time)
      if (!d || !s) continue
      const x = m.get(d) || { dist: d, best: null, bestDate: '', count: 0, sum: 0, history: [], last: '' }
      x.count++
      x.sum += s
      x.last = t.date
      if (x.best == null || s < x.best) { x.best = s; x.bestDate = t.date }
      m.set(d, x)
      const ses = porDist.get(d) || []
      ses.push(s)
      porDist.set(d, ses)
    }
    for (const [d, tiempos] of porDist) {
      m.get(d).history.push({ date: t.date, best: Math.min(...tiempos), avg: tiempos.reduce((a, b) => a + b, 0) / tiempos.length, n: tiempos.length })
    }
  }
  return [...m.values()].map((x) => ({ ...x, avg: x.sum / x.count })).sort((a, b) => a.dist - b.dist)
}

/** Resumen de una sesión de series: «6×300 · media 48,9 · mejor 47,8». */
export function repsSummary(reps) {
  const grupos = new Map()
  for (const r of reps || []) {
    const d = n(r.dist)
    const s = parseTime(r.time)
    if (!d) continue
    const g = grupos.get(d) || []
    if (s) g.push(s)
    else g.push(null)
    grupos.set(d, g)
  }
  return [...grupos.entries()].map(([d, ts]) => {
    const ok = ts.filter((x) => x != null)
    return `${ts.length}×${d}${ok.length ? ` · media ${fmtTime(ok.reduce((a, b) => a + b, 0) / ok.length)} · mejor ${fmtTime(Math.min(...ok))}` : ''}`
  }).join('  |  ')
}

/* --------------------------------------------------------------- exportar -- */

const csv = (v) => {
  const s = String(v ?? '')
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const MESES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fechaHevy = (date, hhmm = '18:00') => {
  const d = parseIso(date)
  return `${d.getDate()} ${MESES_EN[d.getMonth()]} ${d.getFullYear()}, ${hhmm}`
}

/**
 * CSV con las columnas de la exportación de Hevy (una fila por serie).
 * Sirve para tenerlo todo en el formato de Hevy y para hojas de cálculo.
 */
export function exportHevy(db) {
  const head = ['title', 'start_time', 'end_time', 'description', 'exercise_title', 'superset_id', 'exercise_notes', 'set_index', 'set_type', 'weight_kg', 'reps', 'distance_km', 'duration_seconds', 'rpe']
  const rows = [head]
  for (const t of [...(db.training || [])].filter((x) => x.gym).sort((a, b) => a.date.localeCompare(b.date))) {
    const rutina = (db.routines || []).find((r) => r.id === t.gym.routineId)
    const dia = rutina?.days.find((d) => d.id === t.gym.dayId)
    const title = [rutina?.name, dia?.name].filter(Boolean).join(' — ') || t.type || 'Gimnasio'
    const ini = fechaHevy(t.date)
    const finD = new Date(parseIso(t.date).getTime() + (18 * 60 + (Number(t.minutes) || 60)) * 60000)
    const fin = fechaHevy(t.date, `${String(finD.getHours()).padStart(2, '0')}:${String(finD.getMinutes()).padStart(2, '0')}`)
    for (const e of t.gym.exercises || []) {
      if (e.skipped) continue
      ;(e.sets || []).forEach((s, i) => {
        if (n(s.reps) == null && n(s.kg) == null) return
        // Los ejercicios de un mismo bloque con más de uno van como superserie.
        const mismoBloque = e.block && (t.gym.exercises || []).filter((x) => !x.skipped && x.block === e.block).length > 1
        const superset = mismoBloque ? [...new Set((t.gym.exercises || []).map((x) => x.block).filter(Boolean))].indexOf(e.block) : ''
        rows.push([title, ini, fin, t.notes || '', e.name, superset, e.notes || '', i, s.warmup ? 'warmup' : 'normal', n(s.kg) ?? '', n(s.reps) ?? '', '', '', t.rpe ?? ''])
      })
    }
  }
  return rows.map((r) => r.map(csv).join(',')).join('\n')
}

/**
 * CSV en el formato de Strong, que es el que Hevy acepta al IMPORTAR
 * (Ajustes → Exportar e importar datos → Importar datos de Strong).
 */
export function exportStrong(db) {
  const head = ['Date', 'Workout Name', 'Duration', 'Exercise Name', 'Set Order', 'Weight', 'Reps', 'Distance', 'Seconds', 'Notes', 'Workout Notes', 'RPE']
  const rows = [head]
  for (const t of [...(db.training || [])].filter((x) => x.gym).sort((a, b) => a.date.localeCompare(b.date))) {
    const rutina = (db.routines || []).find((r) => r.id === t.gym.routineId)
    const dia = rutina?.days.find((d) => d.id === t.gym.dayId)
    const name = [rutina?.name, dia?.name].filter(Boolean).join(' — ') || 'Gimnasio'
    const min = Number(t.minutes) || 60
    const duracion = `${Math.floor(min / 60)}h ${min % 60}m`
    for (const e of t.gym.exercises || []) {
      if (e.skipped) continue
      let orden = 0
      for (const s of e.sets || []) {
        if (n(s.reps) == null && n(s.kg) == null) continue
        rows.push([`${t.date} 18:00:00`, name, duracion, e.name, s.warmup ? 'W' : ++orden, n(s.kg) ?? 0, n(s.reps) ?? 0, 0, 0, e.notes || '', t.notes || '', ''])
      }
    }
  }
  return rows.map((r) => r.map(csv).join(',')).join('\n')
}

export function downloadText(name, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/* ------------------------------------------ PDF de plan con tabla de columnas -- */

/**
 * Lee el PDF con su maquetación: cada trozo de texto con su posición, y los
 * enlaces (los vídeos de cada ejercicio). Corre en el navegador, así que vale
 * igual en el ordenador, la tablet y la web.
 */
export async function pdfToPages(file) {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const { items } = await page.getTextContent()
    const anns = await page.getAnnotations().catch(() => [])
    pages.push({
      items: items.filter((it) => it.str?.trim()).map((it) => ({ s: it.str.trim(), x: it.transform[4], y: it.transform[5] })),
      links: anns.filter((a) => a.subtype === 'Link' && (a.url || a.unsafeUrl)).map((a) => ({ y: (a.rect[1] + a.rect[3]) / 2, url: a.url || a.unsafeUrl })),
    })
  }
  return pages
}

/** Las páginas como texto línea a línea, para el lector genérico. */
export function pagesToText(pages) {
  const out = []
  for (const { items } of pages) {
    const filas = new Map()
    for (const it of items) {
      const y = Math.round(it.y / 3)
      const fila = filas.get(y) || []
      fila.push(it)
      filas.set(y, fila)
    }
    for (const y of [...filas.keys()].sort((a, b) => b - a)) {
      out.push(filas.get(y).sort((a, b) => a.x - b.x).map((t) => t.s).join('   '))
    }
  }
  return out.join('\n')
}

const COLS = ['orden', 'ejercicio', 'series', 'repet', 'indicacion', 'tempo', 'tecnica', 'material', 'tips']
const CABECERAS = {
  orden: /^orden$/i, ejercicio: /^ejercicios?$/i, series: /^series$/i, repet: /^repet/i,
  indicacion: /^indicaci/i, tempo: /^tempo$/i, tecnica: /^t[eé]cnica$/i, material: /^material$/i, tips: /^(tips|v[ií]deo)/i,
}
const ICONO_VIDEO = /^(\u{1F4F9}|video|vídeo)$/iu
const juntar = (a, b) => [a, b].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()

/**
 * La plantilla de tus PDF: una tabla con Orden · Ejercicio · Series · Repet. ·
 * Indicación · Tempo · Técnica · Material · Tips/Vídeo, y celdas de varias
 * líneas centradas en vertical. Cada trozo de texto se asigna a su columna por
 * la posición horizontal y a su ejercicio por la vertical (al más cercano),
 * que es justo cómo lo lee una persona. Devuelve `null` si no hay tabla.
 */
export function parsePlanTable(pages) {
  const dias = []
  const meta = {}
  for (const { items, links } of pages) {
    const head = items.find((i) => CABECERAS.ejercicio.test(i.s))
    const series = head && items.find((i) => CABECERAS.series.test(i.s) && Math.abs(i.y - head.y) < 4)
    if (!head || !series) continue
    const h = {}
    for (const it of items) {
      if (Math.abs(it.y - head.y) > 4) continue
      for (const c of COLS) if (CABECERAS[c].test(it.s)) h[c] = it.x
    }
    // Límites entre columnas: los textos de cada celda van centrados, así que
    // se mide desde las cabeceras con márgenes que aguantan celdas anchas.
    const lim = {
      orden: (h.orden ?? 60) + 32,
      ejercicio: (h.series ?? 245) - 4,
      series: (h.repet ?? 284) - 5,
      repet: (h.repet ?? 284) + 22,
      indicacion: (h.tempo ?? 411) - 26,
      tempo: (h.tempo ?? 411) + 40,
      tecnica: (h.material ?? 700) - 12,
      material: (h.tips ?? 748) - 8,
    }
    const colDe = (x) => {
      for (const c of COLS.slice(0, -1)) if (x < lim[c]) return c
      return 'tips'
    }

    // Lo de encima de la tabla: plan, fechas y foco.
    const arriba = items.filter((i) => i.y > head.y + 4)
    const plan = arriba.find((i) => /^plan$/i.test(i.s))
    if (plan) {
      const valor = arriba.filter((i) => Math.abs(i.y - plan.y) < 4 && i.x > plan.x && i.x < (h.series ?? 245)).map((i) => i.s).join(' ')
      if (valor) meta.plan = valor
    }
    const fechas = arriba.map((i) => i.s).filter((s) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s))
    if (fechas.length) meta.fechas = fechas
    const foco = arriba.filter((i) => i.x > (h.indicacion ?? 333) + 80 && i.x < (h.material ?? 700) - 12 && !/^foco$/i.test(i.s)).map((i) => i.s)
    if (foco.length) meta.foco = foco

    // Las filas de la tabla, agrupadas por altura.
    const abajo = items.filter((i) => i.y < head.y - 3).sort((a, b) => b.y - a.y)
    const filas = []
    for (const it of abajo) {
      const f = filas.find((r) => Math.abs(r.y - it.y) <= 2.5)
      if (f) f.items.push(it)
      else filas.push({ y: it.y, items: [it] })
    }
    const ejercicios = []
    const sueltos = []
    const bloques = []
    for (const f of filas) {
      const celdas = {}
      for (const it of f.items.sort((a, b) => a.x - b.x)) {
        const c = colDe(it.x)
        if (c === 'tips' && ICONO_VIDEO.test(it.s)) continue
        celdas[c] = juntar(celdas[c], it.s)
      }
      if (celdas.orden) { bloques.push({ y: f.y, label: celdas.orden }); delete celdas.orden }
      if (/^\d{1,2}$/.test(celdas.series || '') && celdas.ejercicio) ejercicios.push({ y: f.y, ...celdas })
      else if (Object.keys(celdas).length) sueltos.push({ y: f.y, ...celdas })
    }
    if (!ejercicios.length) continue

    // Las celdas de varias líneas: en cada columna, las líneas seguidas (a
    // menos de un renglón de distancia) son un mismo párrafo. Si el párrafo
    // toca la fila de un ejercicio, es suyo; si no, va al ejercicio más
    // cercano a su centro. Así una celda de cuatro líneas no se reparte entre
    // los ejercicios de al lado.
    const cercano = (y) => ejercicios.reduce((a, e) => (Math.abs(e.y - y) < Math.abs(a.y - y) ? e : a))
    for (const c of COLS.filter((x) => x !== 'orden' && x !== 'series')) {
      const trozos = [
        ...ejercicios.filter((e) => e[c]).map((e) => ({ y: e.y, txt: e[c], dueno: e })),
        ...sueltos.filter((x) => x[c]).map((x) => ({ y: x.y, txt: x[c], dueno: null })),
      ].sort((a, b) => b.y - a.y)
      const parrafos = []
      for (const t of trozos) {
        const ult = parrafos[parrafos.length - 1]
        if (ult && ult[ult.length - 1].y - t.y <= 11) ult.push(t)
        else parrafos.push([t])
      }
      for (const par of parrafos) {
        if (!par.some((t) => !t.dueno)) continue
        const arriba = par[0].y + 3
        const abajo = par[par.length - 1].y - 3
        const filas = ejercicios.filter((e) => e.y <= arriba && e.y >= abajo)
        // Un párrafo que solo toca una fila (o ninguna) es entero de un
        // ejercicio: el suyo, o el más cercano a su centro. Si cruza varias,
        // son celdas pegadas de ejercicios distintos: cada línea con la suya.
        const unico = filas.length === 1 ? filas[0] : filas.length === 0 ? cercano((par[0].y + par[par.length - 1].y) / 2) : null
        const porDestino = new Map()
        for (const t of par) {
          const d = t.dueno || unico || cercano(t.y)
          porDestino.set(d, [...(porDestino.get(d) || []), t.txt])
        }
        for (const [e, txts] of porDestino) e[c] = juntar(txts.join(' '), '')
      }
    }

    for (const l of links || []) {
      const e = cercano(l.y)
      if (Math.abs(e.y - l.y) < 12 && !e.video) e.video = l.url
    }

    /**
     * El bloque de cada ejercicio. Los números («1», «2») van centrados en su
     * celda, así que manda el más cercano. Las palabras («Test», «Saltos») van
     * en la fila de su primer ejercicio: valen solo para esa fila, salvo la
     * última etiqueta de la tabla, que llega hasta el final.
     */
    const ultimaY = bloques.length ? Math.min(...bloques.map((b) => b.y)) : null
    const bloqueDe = (e) => {
      const palabra = bloques.find((b) => !/^\d+$/.test(b.label) && (Math.abs(b.y - e.y) <= 3 || (b.y === ultimaY && e.y < b.y)))
      if (palabra) return palabra.label
      const numeros = bloques.filter((b) => /^\d+$/.test(b.label))
      if (!numeros.length) return ''
      return numeros.reduce((a, b) => (Math.abs(b.y - e.y) < Math.abs(a.y - e.y) ? b : a)).label
    }

    const dia = { id: uid('rd'), name: '', exercises: [] }
    for (const e of ejercicios.sort((a, b) => b.y - a.y)) {
      const bloque = bloqueDe(e)
      dia.exercises.push({
        id: uid('re'),
        name: e.ejercicio,
        sets: Number(e.series),
        reps: (e.repet || '').replace(/\s*([-–\/])\s*/g, '$1'),
        rest: '',
        load: e.indicacion || '',
        tempo: (e.tempo || '').replace(/⬇/g, '↓').replace(/⬆/g, '↑'),
        notes: e.tecnica || '',
        material: e.material || '',
        video: e.video || '',
        block: bloque,
      })
    }
    dias.push(dia)
  }
  return dias.length ? { dias, meta } : null
}

/** «Gimnasio 2026-27 - Día 2 - P. General I.pdf» → día «Día 2», plan «P. General I». */
export function namesFromFile(fileName) {
  const base = String(fileName || '').replace(/\.pdf$/i, '')
  const partes = base.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean)
  if (partes.length >= 3) return { day: partes[1], plan: partes.slice(2).join(' - ') }
  if (partes.length === 2) return { day: partes[1], plan: partes[0] }
  return { day: base, plan: base }
}

/**
 * Un PDF de rutina → { plan, days }. Primero se intenta leer como tabla (la
 * plantilla de tus planes); si no la tiene, se lee como texto libre.
 */
export function parseRoutinePdf(pages, fileName) {
  const nombres = namesFromFile(fileName)
  const tabla = parsePlanTable(pages)
  if (tabla) {
    tabla.dias.forEach((d, i) => { d.name = tabla.dias.length > 1 ? `${nombres.day} (${i + 1})` : nombres.day })
    return { plan: nombres.plan, planLargo: tabla.meta.plan || '', fechas: tabla.meta.fechas || [], foco: tabla.meta.foco || [], days: tabla.dias }
  }
  const r = parseRoutineText(pagesToText(pages), nombres.day)
  return { plan: nombres.plan, planLargo: '', fechas: [], foco: [], days: r.days }
}
