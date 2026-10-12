import { iso, addDays, startOfWeek, parseIso } from './date.js'

/**
 * ECOs — Equivalente de Carga Objetiva (Cejuela y Esteve-Lanao, 2011).
 *
 * La carga de una sesión es el tiempo en cada zona de intensidad multiplicado
 * por un coeficiente que crece con la zona (1, 2, 3, 4, 6, 9 en el original).
 * Aquí las zonas son las cinco de pulso que da Garmin en cada actividad, así
 * que se usan los cinco primeros coeficientes: es una aproximación, porque el
 * modelo original define las zonas con umbrales ventilatorios propios y no con
 * los porcentajes de Garmin. Sirve para comparar tus sesiones entre sí y con
 * tu RPE, no para compararte con otros.
 *
 * La carrera es la referencia (×1); en bici el original usa ×0,5 y nadando
 * ×0,75. La fuerza en gimnasio no tiene ECOs: ahí manda el RPE.
 */
export const ECOS_COEF = [1, 2, 3, 4, 6]

const factor = (type = '') => (/cycl|bik|bici|spin/i.test(type) ? 0.5 : /swim|nata/i.test(type) ? 0.75 : 1)

/** ECOs de una actividad de Garmin con sus zonas. */
export function ecosOf(act) {
  if (!act?.zones || /strength|fuerza/i.test(act.type || '')) return null
  const total = act.zones.reduce((a, s, i) => a + (s / 60) * ECOS_COEF[i], 0)
  return Math.round(total * factor(act.type))
}

/** Las actividades del reloj que corresponden a un entreno apuntado. */
export function activitiesFor(db, t) {
  const acts = db.garminActivities || []
  if (t.garminId) {
    const a = acts.find((x) => x.id === t.garminId)
    if (a) return [a]
  }
  return acts.filter((a) => a.date === t.date && a.zones && !/strength/i.test(a.type || ''))
}

/** ECOs de un entreno: la suma de sus actividades del reloj, o null si no hay. */
export function trainingEcos(db, t) {
  const vals = activitiesFor(db, t).map(ecosOf).filter((v) => v != null)
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null
}

/** El reparto del tiempo por zonas de un entreno, en minutos. */
export function zonesFor(db, t) {
  const z = [0, 0, 0, 0, 0]
  let hay = false
  for (const a of activitiesFor(db, t)) {
    if (!a.zones) continue
    hay = true
    a.zones.forEach((s, i) => { z[i] += s / 60 })
  }
  return hay ? z : null
}

/**
 * Tu RPE frente a la carga objetiva. Si van juntos, tu percepción es fiable;
 * si no, hay sesiones que te cuestan más (o menos) de lo que fueron: eso suele
 * ser fatiga, mal sueño o calor. Devuelve la relación y las sesiones que más se
 * desvían de lo normal en ti.
 */
export function ecosVsRpe(db) {
  const filas = []
  for (const t of db.training || []) {
    if (!t.done) continue
    const e = trainingEcos(db, t)
    const s = (Number(t.rpe) || 0) * (Number(t.minutes) || 0)
    if (e && s) filas.push({ t, ecos: e, srpe: s, ratio: s / e })
  }
  if (filas.length < 4) return { n: filas.length, filas }
  const mx = filas.reduce((a, f) => a + f.ecos, 0) / filas.length
  const my = filas.reduce((a, f) => a + f.srpe, 0) / filas.length
  let sxy = 0, sxx = 0, syy = 0
  for (const f of filas) { sxy += (f.ecos - mx) * (f.srpe - my); sxx += (f.ecos - mx) ** 2; syy += (f.srpe - my) ** 2 }
  const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : null
  const ratios = filas.map((f) => f.ratio).sort((a, b) => a - b)
  const mediana = ratios[Math.floor(ratios.length / 2)]
  // Desviación de cada sesión respecto a tu relación habitual RPE/ECOs.
  const conDesvio = filas.map((f) => ({ ...f, desvio: (f.ratio / mediana - 1) * 100 }))
  return {
    n: filas.length, r, mediana, filas: conDesvio,
    masDuras: [...conDesvio].sort((a, b) => b.desvio - a.desvio).filter((f) => f.desvio > 25).slice(0, 5),
    masFaciles: [...conDesvio].sort((a, b) => a.desvio - b.desvio).filter((f) => f.desvio < -25).slice(0, 5),
  }
}

/** ECOs por semana, las últimas `n`, para ver la carga objetiva junto a la percibida. */
export function weeklyEcos(db, n = 12) {
  const base = startOfWeek(new Date())
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const ini = iso(addDays(base, -7 * i))
    const fin = iso(addDays(parseIso(ini), 6))
    const acts = (db.garminActivities || []).filter((a) => a.date >= ini && a.date <= fin)
    const ecos = acts.map(ecosOf).filter((v) => v != null).reduce((a, b) => a + b, 0)
    const srpe = (db.training || []).filter((t) => t.done && t.date >= ini && t.date <= fin)
      .reduce((a, t) => a + (Number(t.rpe) || 0) * (Number(t.minutes) || 0), 0)
    out.push({ start: ini, ecos, srpe })
  }
  return out
}
