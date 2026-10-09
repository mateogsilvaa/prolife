import { iso, addDays, parseIso, weekday, today } from './date.js'

/**
 * Lo que llega del reloj Garmin (ver `electron/garmin.js`): un registro por día
 * en `db.wellness[fecha]` y las actividades en `db.garminActivities`.
 */

export const wellnessOn = (db, date) => (db.wellness || {})[date] || null

/** Los últimos `n` días, del más antiguo a hoy, con su registro (o `null`). */
export function lastDays(db, n, hasta = today()) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const date = iso(addDays(parseIso(hasta), -i))
    out.push({ date, w: wellnessOn(db, date) })
  }
  return out
}

export const hasHealth = (db) => Object.keys(db.wellness || {}).length > 0 || (db.garminActivities || []).length > 0

const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const mediana = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/** «7 h 25 min» */
export const hrs = (sec) => {
  if (sec == null) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}

/** Hora local de un timestamp «local» de Garmin (ya viene desplazado a tu zona). */
export const clockOf = (ts) => {
  if (ts == null) return '—'
  const d = new Date(ts)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** Minutos desde las 18:00, para poder hacer medias de horas de acostarse que cruzan la medianoche. */
const minutosDesdeTarde = (ts) => {
  const d = new Date(ts)
  return (d.getUTCHours() * 60 + d.getUTCMinutes() - 18 * 60 + 1440) % 1440
}
const deMinutosDesdeTarde = (m) => {
  const t = (Math.round(m) + 18 * 60) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/**
 * Todo lo que se puede decir de la salud con lo que hay: medias de 7 y 30
 * días, la línea base del pulso en reposo y la relación con los entrenos.
 */
export function healthStats(db) {
  const d30 = lastDays(db, 30)
  const d7 = d30.slice(-7)
  const sueno = (xs) => xs.map((x) => x.w?.sleep?.seconds).filter((v) => v > 0)
  const pasos = (xs) => xs.map((x) => x.w?.steps).filter((v) => v != null)
  const reposo = (xs) => xs.map((x) => x.w?.restingHr).filter((v) => v > 0)
  const estres = (xs) => xs.map((x) => x.w?.stress).filter((v) => v != null)

  // Anoche: el sueño se apunta en el día en que te despiertas.
  const hoy = wellnessOn(db, today())
  const anoche = hoy?.sleep?.seconds ? { date: today(), ...hoy.sleep } : null
  const ultimoSueno = anoche || [...d30].reverse().find((x) => x.w?.sleep?.seconds)?.w?.sleep || null

  const d60 = lastDays(db, 60)
  const baseRep = mediana(reposo(d60.slice(0, -1)))
  const repHoy = hoy?.restingHr ?? [...d7].reverse().find((x) => x.w?.restingHr)?.w?.restingHr ?? null

  const acostarse = d30.map((x) => x.w?.sleep?.start).filter((v) => v != null).map(minutosDesdeTarde)
  const levantarse = d30.map((x) => x.w?.sleep?.end).filter((v) => v != null).map(minutosDesdeTarde)

  // Por día de la semana (lunes = 0), con los últimos 60 días.
  const wdSueno = Array.from({ length: 7 }, () => [])
  const wdPasos = Array.from({ length: 7 }, () => [])
  for (const x of d60) {
    const wd = weekday(parseIso(x.date))
    if (x.w?.sleep?.seconds) wdSueno[wd].push(x.w.sleep.seconds)
    if (x.w?.steps != null) wdPasos[wd].push(x.w.steps)
  }

  return {
    anoche, ultimoSueno,
    sleep7: media(sueno(d7)), sleep30: media(sueno(d30)),
    steps7: media(pasos(d7)), steps30: media(pasos(d30)),
    stepsHoy: hoy?.steps ?? null, stepGoal: hoy?.stepGoal ?? [...d7].reverse().find((x) => x.w?.stepGoal)?.w?.stepGoal ?? null,
    rest7: media(reposo(d7)), restBase: baseRep, restHoy: repHoy,
    stress7: media(estres(d7)),
    bbHoy: hoy ? { high: hoy.bbHigh, low: hoy.bbLow } : null,
    bedtime: acostarse.length ? deMinutosDesdeTarde(media(acostarse)) : null,
    wake: levantarse.length ? deMinutosDesdeTarde(media(levantarse)) : null,
    shortNights: sueno(d30).filter((s) => s < 6.5 * 3600).length,
    wdSueno: wdSueno.map(media), wdPasos: wdPasos.map(media),
    d30, d60,
    trainingVsSleep: trainingVsSleep(db),
  }
}

/**
 * ¿Entrenas peor después de dormir poco? Se compara el RPE y las molestias de
 * los entrenos que vinieron tras una noche corta (menos de 7 h) con los que
 * vinieron tras una normal. Con pocos datos no se dice nada.
 */
function trainingVsSleep(db) {
  const corta = []
  const normal = []
  for (const t of db.training || []) {
    if (!t.done) continue
    const s = wellnessOn(db, t.date)?.sleep?.seconds
    if (!s) continue
    ;(s < 7 * 3600 ? corta : normal).push(t)
  }
  if (corta.length < 3 || normal.length < 3) return null
  const rpe = (xs) => media(xs.map((t) => Number(t.rpe) || 0))
  const dolor = (xs) => xs.filter((t) => (t.pains || []).length).length / xs.length
  return {
    corta: corta.length, normal: normal.length,
    rpeCorta: rpe(corta), rpeNormal: rpe(normal),
    dolorCorta: dolor(corta), dolorNormal: dolor(normal),
  }
}

/* ------------------------------------------------------------ actividades */

const TIPOS = {
  running: 'Carrera', track_running: 'Pista', trail_running: 'Trail', treadmill_running: 'Cinta',
  indoor_running: 'Carrera en interior', walking: 'Caminar', hiking: 'Senderismo', cycling: 'Bici',
  indoor_cycling: 'Bici estática', strength_training: 'Fuerza', cardio: 'Cardio', lap_swimming: 'Natación',
  yoga: 'Yoga', other: 'Otra', breathwork: 'Respiración', hiit: 'HIIT',
}
export const activityLabel = (a) => TIPOS[a.type] || (a.type ? a.type.replace(/_/g, ' ') : 'Actividad')

/** «4:52 /km» a partir de m/s. */
export const pace = (speed) => {
  if (!speed || speed <= 0) return null
  const s = 1000 / speed
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} /km`
}
export const km = (m) => (m ? `${(m / 1000).toFixed(m >= 10000 ? 1 : 2).replace('.', ',')} km` : null)

export const activitiesOn = (db, date) => (db.garminActivities || []).filter((a) => a.date === date)

/** Una línea con lo esencial: «Carrera · 8,20 km · 42 min · 5:07 /km · FC 152». */
export function activityLine(a) {
  return [
    activityLabel(a),
    km(a.distance),
    a.seconds ? `${Math.round(a.seconds / 60)} min` : null,
    /run/.test(a.type || '') ? pace(a.speed) : null,
    a.avgHr ? `FC ${Math.round(a.avgHr)}` : null,
  ].filter(Boolean).join(' · ')
}

/**
 * El tipo de entreno de prolife que más se parece a una actividad de Garmin.
 * Solo es la propuesta inicial: en el formulario se cambia con un toque.
 */
export function guessTrainingType(a, types = []) {
  const has = (t) => types.includes(t) && t
  const name = (a.name || '').toLowerCase()
  if (/serie|interval|fartlek|cuesta|repet/.test(name)) return has('Series') || types[0]
  if (/t[eé]cnica|drill/.test(name)) return has('Técnica') || types[0]
  if (/compet|carrera popular|race|10k|5k|media|marat/.test(name)) return has('Competición') || types[0]
  if (a.type === 'strength_training' || /gym|gimnasio|fuerza|pesas/.test(name)) return has('Gimnasio') || types[0]
  if (a.type === 'track_running') return has('Series') || types[0]
  if (/run/.test(a.type || '')) return has('Rodaje') || types[0]
  if (/walk|yoga|breath/.test(a.type || '')) return has('Recuperación') || types[0]
  return types[0]
}

/** Lo que una actividad aporta a las notas de un entreno. */
export const activityNote = (a) => `⌚ ${activityLine(a)}${a.maxHr ? ` (máx ${Math.round(a.maxHr)})` : ''}${a.elevation ? ` · +${Math.round(a.elevation)} m` : ''}`
