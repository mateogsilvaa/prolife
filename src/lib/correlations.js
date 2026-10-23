import { iso, addDays, parseIso, today } from './date.js'
import { wellnessOn, bbDe, hrs } from './health.js'
import { loadOf } from './training.js'

/**
 * Qué tienen que ver tus datos entre sí.
 *
 * Se arma una tabla con una fila por día —sueño, pulso, Body Battery, estrés,
 * pasos, carga, RPE, CMJ, molestias— y se prueban relaciones concretas que
 * tienen sentido en un atleta («¿duermes peor los días de carga alta?», «¿tu
 * CMJ baja cuando duermes poco?»). De cada una se dice si hay relación, de qué
 * tamaño y, sobre todo, en unidades que se entiendan: «tras noches de más de
 * 7 h 30 tu CMJ es 1,4 cm mejor».
 *
 * Con pocos datos no se afirma nada: menos de 8 días con las dos cosas
 * medidas, y la relación se queda en «faltan datos».
 */

const MIN_N = 8
const n = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Minutos desde las 18:00: así las 23:30 y la 01:00 se pueden promediar. */
const minutosNoche = (ts) => {
  if (ts == null) return null
  const d = new Date(ts)
  return (d.getUTCHours() * 60 + d.getUTCMinutes() - 18 * 60 + 1440) % 1440
}

/** Una fila por día con todo lo medible, de los últimos `dias` días. */
export function dailyTable(db, dias = 150) {
  const porFecha = new Map()
  for (const t of db.training || []) {
    const x = porFecha.get(t.date) || []
    x.push(t)
    porFecha.set(t.date, x)
  }
  const filas = []
  const hoy = parseIso(today())
  for (let i = dias - 1; i >= 0; i--) {
    const date = iso(addDays(hoy, -i))
    const w = wellnessOn(db, date)
    const ts = (porFecha.get(date) || []).filter((t) => t.done)
    const s = w?.sleep
    const total = s?.seconds || null
    const bb = bbDe(w)
    const cmj = ts.find((t) => n(t.cmjPre))
    // Las caritas del formulario de RB Team (1 a 5), si ese día lo rellenaste.
    const cara = (k) => {
      const v = ts.map((t) => n(t.rb?.[k])).filter((x) => x != null)
      return v.length ? media(v) : null
    }
    const dolor = Math.max(0, ...(porFecha.get(date) || []).flatMap((t) => (t.pains || []).map((p) => Number(p.level) || 0)))
    filas.push({
      date,
      sueno: total ? total / 3600 : null,
      profundo: total && s.deep != null ? (s.deep / total) * 100 : null,
      rem: total && s.rem != null ? (s.rem / total) * 100 : null,
      acostarse: minutosNoche(s?.start),
      reposo: n(w?.restingHr),
      bb: n(bb?.wake),
      estres: n(w?.stress),
      pasos: n(w?.steps),
      hrv: n(w?.hrv),
      carga: ts.length ? ts.reduce((a, t) => a + loadOf(t), 0) : 0,
      entreno: ts.length > 0,
      rpe: ts.length ? media(ts.map((t) => n(t.rpe)).filter((x) => x != null)) : null,
      cmjPre: cmj ? n(cmj.cmjPre) : null,
      cmjCaida: cmj && n(cmj.cmjPost) ? ((n(cmj.cmjPost) - n(cmj.cmjPre)) / n(cmj.cmjPre)) * 100 : null,
      dolor: (porFecha.get(date) || []).length ? dolor : null,
      energia: cara('energia'),
      ganas: cara('ganas'),
      sensaciones: cara('sensaciones'),
    })
  }
  // Carga aguda (7 días) y crónica (28 días): la relación entre las dos (ACWR)
  // es el indicador clásico de «estás subiendo demasiado rápido».
  for (let i = 0; i < filas.length; i++) {
    const ult = (k) => filas.slice(Math.max(0, i - k + 1), i + 1).reduce((a, f) => a + f.carga, 0)
    const aguda = ult(7)
    const cronica = ult(28) / 4
    filas[i].carga7 = aguda
    filas[i].acwr = i >= 27 && cronica > 0 ? aguda / cronica : null
  }
  return filas
}

/** Correlación de Pearson. */
function pearson(pares) {
  const k = pares.length
  if (k < 3) return null
  const mx = media(pares.map((p) => p[0]))
  const my = media(pares.map((p) => p[1]))
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const [x, y] of pares) {
    sxy += (x - mx) * (y - my)
    sxx += (x - mx) ** 2
    syy += (y - my) ** 2
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null
}

/** Las variables, con cómo se escriben. */
const mas = (alto) => (alto ? 'o más' : 'o menos')
const coma = (v, d = 1) => v.toFixed(d).replace('.', ',')
const horaNoche = (v) => { const t = (Math.round(v) + 18 * 60) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }

/**
 * Las variables: cómo se llaman, cómo se escribe un valor y cómo se dice
 * «cuando está alto/bajo» en una frase normal.
 */
export const VAR = {
  sueno: { label: 'horas de sueño', fmt: (v) => hrs(v * 3600), con: (v, a) => `durmiendo ${hrs(v * 3600)} ${mas(a)}` },
  profundo: { label: '% de sueño profundo', fmt: (v) => `${v.toFixed(0)} %`, con: (v, a) => `con un ${v.toFixed(0)} % de sueño profundo ${mas(a)}` },
  rem: { label: '% de REM', fmt: (v) => `${v.toFixed(0)} %`, con: (v, a) => `con un ${v.toFixed(0)} % de REM ${mas(a)}` },
  acostarse: { label: 'hora de acostarte', fmt: horaNoche, con: (v, a) => `acostándote a las ${horaNoche(v)} ${a ? 'o más tarde' : 'o antes'}` },
  reposo: { label: 'tu pulso en reposo', fmt: (v) => `${v.toFixed(0)} ppm`, con: (v, a) => `con el pulso en reposo en ${v.toFixed(0)} ppm ${mas(a)}` },
  bb: { label: 'tu Body Battery al despertar', fmt: (v) => v.toFixed(0), con: (v, a) => `con la Body Battery en ${v.toFixed(0)} ${mas(a)}` },
  estres: { label: 'el estrés', fmt: (v) => v.toFixed(0), con: (v, a) => `con un estrés de ${v.toFixed(0)} ${mas(a)}` },
  pasos: { label: 'los pasos', fmt: (v) => Math.round(v).toLocaleString('es'), con: (v, a) => `con ${Math.round(v).toLocaleString('es')} pasos ${mas(a)}` },
  hrv: { label: 'tu VFC', fmt: (v) => `${v.toFixed(0)} ms`, con: (v, a) => `con la VFC en ${v.toFixed(0)} ms ${mas(a)}` },
  carga: { label: 'la carga del día', fmt: (v) => v.toFixed(0), con: (v, a) => `los días de carga ${v.toFixed(0)} ${mas(a)}` },
  carga7: { label: 'la carga de 7 días', fmt: (v) => v.toFixed(0), con: (v, a) => `con una carga semanal de ${v.toFixed(0)} ${mas(a)}` },
  acwr: { label: 'la carga frente a tu habitual', fmt: (v) => coma(v, 2), con: (v, a) => `con la carga a ${coma(v, 2)} veces tu habitual ${mas(a)}` },
  rpe: { label: 'el RPE', fmt: (v) => coma(v), con: (v, a) => `con un RPE de ${coma(v)} ${mas(a)}` },
  cmjPre: { label: 'tu CMJ previo', fmt: (v) => `${coma(v)} cm`, con: (v, a) => `con el CMJ en ${coma(v)} cm ${mas(a)}` },
  cmjCaida: { label: 'la caída del CMJ tras el entreno', fmt: (v) => `${coma(v)} %`, con: (v, a) => `con el CMJ variando ${coma(v)} % ${mas(a)}` },
  dolor: { label: 'las molestias (0–10)', fmt: (v) => coma(v), con: (v, a) => `con molestias de ${coma(v)} ${mas(a)}` },
  energia: { label: 'la energía al llegar (1–5)', fmt: (v) => coma(v), con: (v, a) => `llegando con energía ${coma(v)} ${mas(a)}` },
  ganas: { label: 'las ganas de entrenar (1–5)', fmt: (v) => coma(v), con: (v, a) => `con ganas ${coma(v)} ${mas(a)}` },
  sensaciones: { label: 'las sensaciones al acabar (1–5)', fmt: (v) => coma(v), con: (v, a) => `con sensaciones ${coma(v)} ${mas(a)}` },
}

/**
 * Las relaciones que se prueban. `lag: 1` es «al día siguiente»: la carga de
 * hoy contra el sueño de esta noche, que Garmin apunta en la fecha de mañana.
 * `bueno` dice qué dirección de `y` es la buena, para poder decir si la
 * relación te favorece o te perjudica.
 */
const HIPOTESIS = [
  { x: 'sueno', y: 'rpe', lag: 0, soloEntreno: true, bueno: -1, que: 'Lo que duermes y lo duro que se te hace el entreno', implica: 'Dormir más hace que el mismo entreno se sienta más fácil: la noche antes de una sesión dura cuenta.' },
  { x: 'sueno', y: 'cmjPre', lag: 0, bueno: 1, que: 'Lo que duermes y tu CMJ', implica: 'Saltas más cuando duermes más: antes de un día de calidad o de competir, la noche es parte del entreno.' },
  { x: 'bb', y: 'cmjPre', lag: 0, bueno: 1, que: 'Body Battery al despertar y tu CMJ', implica: 'Cuando recargas bien, saltas más: la Body Battery de la mañana te sirve para decidir si toca calidad.' },
  { x: 'bb', y: 'rpe', lag: 0, soloEntreno: true, bueno: -1, que: 'Body Battery y lo duro que se te hace el entreno', implica: 'Con la batería alta los entrenos se sienten más fáciles.' },
  { x: 'reposo', y: 'rpe', lag: 0, soloEntreno: true, bueno: -1, que: 'Pulso en reposo y RPE', implica: 'Con el pulso en reposo alto te cuesta más entrenar: es una señal de fatiga que puedes mirar cada mañana.' },
  { x: 'reposo', y: 'cmjPre', lag: 0, bueno: 1, que: 'Pulso en reposo y CMJ', implica: 'Cuando el pulso en reposo sube, el salto baja: los dos apuntan a la misma fatiga.' },
  { x: 'hrv', y: 'cmjPre', lag: 0, bueno: 1, que: 'VFC y CMJ', implica: 'Con la VFC alta saltas más: tu sistema nervioso está recuperado.' },
  { x: 'carga', y: 'sueno', lag: 1, bueno: 1, que: 'La carga de un día y cómo duermes esa noche', implica: 'Los días de mucha carga duermes distinto: si duermes peor, conviene no acabar las sesiones duras muy tarde.' },
  { x: 'carga', y: 'reposo', lag: 1, bueno: -1, que: 'La carga de un día y tu pulso en reposo al día siguiente', implica: 'Lo esperable: la carga sube el pulso en reposo del día siguiente. Si no baja en 48 h, no estás recuperando.' },
  { x: 'carga', y: 'bb', lag: 1, bueno: 1, que: 'La carga de un día y la Body Battery al día siguiente', implica: 'Lo esperable: los días fuertes te cuestan recarga. Si tras días suaves tampoco recargas, mira el sueño o el estrés.' },
  { x: 'carga7', y: 'cmjPre', lag: 0, bueno: 1, que: 'La carga de la semana y tu CMJ', implica: 'Cuando acumulas carga, el salto baja: es fatiga normal, pero antes de competir conviene llegar con la semana más suave.' },
  { x: 'acwr', y: 'dolor', lag: 0, bueno: -1, que: 'Subir la carga de golpe y las molestias', implica: 'Las molestias aparecen cuando subes la carga de golpe: sube poco a poco (no más de un 30 % por encima de lo habitual).' },
  { x: 'rpe', y: 'cmjCaida', lag: 0, bueno: 1, que: 'Lo duro del entreno y cuánto cae el CMJ después', implica: 'Cuanto más duro el entreno, más cae el salto después: es la fatiga neuromuscular de la sesión.' },
  { x: 'estres', y: 'sueno', lag: 1, bueno: 1, que: 'El estrés del día y cómo duermes', implica: 'Los días de más estrés duermes distinto: en épocas de exámenes, cuida la noche.' },
  { x: 'pasos', y: 'sueno', lag: 1, bueno: 1, que: 'Los pasos del día y cómo duermes', implica: 'Moverte durante el día cambia tu sueño.' },
  { x: 'acostarse', y: 'bb', lag: 1, bueno: 1, que: 'La hora de acostarte y la Body Battery al despertar', implica: 'Acostarte tarde te deja con menos batería al día siguiente.' },
  { x: 'sueno', y: 'energia', lag: 0, soloEntreno: true, bueno: 1, que: 'Lo que duermes y la energía con la que llegas a entrenar', implica: 'Llegas con más energía cuando duermes más: lo que apuntas en el formulario de tu entrenador lo confirma el reloj.' },
  { x: 'bb', y: 'energia', lag: 0, soloEntreno: true, bueno: 1, que: 'Body Battery al despertar y tu energía al llegar', implica: 'Si las dos van juntas, la Body Battery de la mañana te dice ya cómo vas a llegar al entreno.' },
  { x: 'energia', y: 'cmjPre', lag: 0, bueno: 1, que: 'La energía al llegar y tu CMJ', implica: 'Cómo te notas al llegar se ve en el salto: es un buen termómetro para decidir si apretar.' },
  { x: 'carga7', y: 'ganas', lag: 0, soloEntreno: true, bueno: 1, que: 'La carga de la semana y las ganas de entrenar', implica: 'Si las ganas caen cuando acumulas carga, es una señal temprana de fatiga: antes que el CMJ o el pulso.' },
  { x: 'rpe', y: 'sensaciones', lag: 0, soloEntreno: true, bueno: 1, que: 'Lo duro del entreno y las sensaciones con las que acabas', implica: 'Ver si las sesiones duras te dejan buenas o malas sensaciones ayuda a ajustar la intensidad.' },
  { x: 'acostarse', y: 'sueno', lag: 1, bueno: 1, que: 'La hora de acostarte y lo que duermes', implica: 'Cuanto más tarde te acuestas, menos duermes: tu hora de levantarte no se mueve.' },
]

/**
 * Prueba todas las relaciones y devuelve las que tienen datos, ordenadas por
 * fuerza. Cada una trae una frase en castellano con la diferencia real entre
 * tus mejores y tus peores días.
 */
export function correlations(db) {
  const filas = dailyTable(db)
  const out = []
  for (const h of HIPOTESIS) {
    const pares = []
    for (let i = 0; i + h.lag < filas.length; i++) {
      const fx = filas[i]
      const fy = filas[i + h.lag]
      if (h.soloEntreno && !fy.entreno) continue
      const x = fx[h.x]
      const y = fy[h.y]
      if (x == null || y == null) continue
      if (h.x === 'carga' && !fx.entreno) continue
      pares.push([x, y])
    }
    if (pares.length < MIN_N) {
      out.push({ ...h, n: pares.length, r: null, faltan: MIN_N - pares.length })
      continue
    }
    const r = pearson(pares)
    // Diferencia entre el tercio alto y el tercio bajo de x: lo que se entiende.
    const orden = [...pares].sort((a, b) => a[0] - b[0])
    const tercio = Math.max(2, Math.floor(orden.length / 3))
    const bajos = orden.slice(0, tercio)
    const altos = orden.slice(-tercio)
    const yBajo = media(bajos.map((p) => p[1]))
    const yAlto = media(altos.map((p) => p[1]))
    const corteBajo = bajos[bajos.length - 1][0]
    const corteAlto = altos[0][0]
    out.push({ ...h, n: pares.length, r, yBajo, yAlto, corteBajo, corteAlto })
  }
  return out
    .map((c) => ({ ...c, fuerza: fuerza(c.r), frase: c.r == null ? null : frase(c), implica: implicacion(c) }))
    .sort((a, b) => (b.r == null ? -1 : Math.abs(b.r)) - (a.r == null ? -1 : Math.abs(a.r)))
}

export function fuerza(r) {
  if (r == null) return 'sin datos'
  const a = Math.abs(r)
  return a < 0.2 ? 'ninguna' : a < 0.4 ? 'débil' : a < 0.6 ? 'moderada' : 'fuerte'
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1)

function frase(c) {
  const X = VAR[c.x]
  const Y = VAR[c.y]
  const cuando = c.lag ? ' al día siguiente' : ''
  if (Math.abs(c.r) < 0.2) return `No se ve relación: ${Y.label}${cuando} se queda parecido sea cual sea ${X.label}.`
  return `${cap(X.con(c.corteAlto, true))}, ${Y.label}${cuando} es ${Y.fmt(c.yAlto)}; ${X.con(c.corteBajo, false)}, ${Y.fmt(c.yBajo)}.`
}

/**
 * Qué hacer con una relación: el mensaje práctico si va en la dirección
 * esperable, o un aviso si va al revés (puede ser casualidad con pocos datos).
 */
export function implicacion(c) {
  if (c.r == null || Math.abs(c.r) < 0.2) return null
  const diff = c.yAlto - c.yBajo
  const esperable = Math.sign(diff) === Math.sign(c.bueno) || /esperable/i.test(c.implica || '')
  return esperable ? c.implica : 'Va al revés de lo habitual: con más días de datos se verá si se mantiene o era casualidad.'
}

/* ------------------------------------------------------------- lecturas -- */

/**
 * Lo que dicen tus datos del reloj, en frases. Cada lectura compara con lo que
 * se considera normal para un deportista joven y con tus propios datos.
 */
export function readings(db) {
  const filas = dailyTable(db, 60)
  const ult = (k) => filas.slice(-k)
  const vals = (xs, k) => xs.map((f) => f[k]).filter((v) => v != null)
  const out = []
  const add = (tono, titulo, texto) => out.push({ tono, titulo, texto })

  const s7 = vals(ult(7), 'sueno')
  if (s7.length >= 4) {
    const m = media(s7)
    const deuda = s7.reduce((a, h) => a + Math.max(0, 8 - h), 0)
    if (m < 7) add('mal', `Duermes poco: ${hrs(m * 3600)} de media`, `A un deportista le conviene dormir 8 h o más. Esta semana llevas una deuda de unas ${deuda.toFixed(0)} h; se nota en la recuperación y en el CMJ.`)
    else if (m < 8) add('ojo', `Sueño justo: ${hrs(m * 3600)} de media`, `Cerca, pero por debajo de las 8 h que conviene entrenando. Deuda de la semana: ${deuda.toFixed(1)} h.`)
    else add('bien', `Duermes bien: ${hrs(m * 3600)} de media`, 'Por encima de las 8 h: lo que necesita un cuerpo que entrena.')
  }

  const acost = vals(ult(14), 'acostarse')
  if (acost.length >= 6) {
    const m = media(acost)
    const sd = Math.sqrt(media(acost.map((v) => (v - m) ** 2)))
    if (sd > 45) add('ojo', 'Horario de sueño irregular', `Te acuestas a horas que varían ±${Math.round(sd)} min. La regularidad pesa casi tanto como las horas: acostarte cada día a una hora parecida mejora la calidad del sueño.`)
    else add('bien', 'Horario de sueño regular', `Te acuestas casi siempre a la misma hora (±${Math.round(sd)} min), hacia las ${VAR.acostarse.fmt(m)}.`)
  }

  const prof = vals(ult(14), 'profundo')
  const rem = vals(ult(14), 'rem')
  if (prof.length >= 5) {
    const p = media(prof)
    if (p < 13) add('ojo', `Poco sueño profundo: ${p.toFixed(0)} %`, 'Lo normal ronda el 13–23 %. El profundo es el que repara músculo; suele bajar con alcohol, cenas tardías, pantallas o entrenos intensos muy tarde.')
    else add('bien', `Sueño profundo normal: ${p.toFixed(0)} %`, 'Dentro de lo esperable (13–23 %).')
  }
  if (rem.length >= 5) {
    const r = media(rem)
    if (r < 18) add('ojo', `Poco REM: ${r.toFixed(0)} %`, 'Lo normal ronda el 20–25 %. El REM pesa en la memoria y en aprender gestos técnicos; se recorta sobre todo cuando acortas el final de la noche.')
  }

  const rep = vals(filas, 'reposo')
  const rep7 = vals(ult(7), 'reposo')
  if (rep.length >= 14 && rep7.length >= 3) {
    const base = media(rep.slice(0, -7))
    const m7 = media(rep7)
    const d = m7 - base
    if (d >= 4) add('mal', `Pulso en reposo alto: +${d.toFixed(0)} ppm`, `Esta semana ${m7.toFixed(0)} frente a tu base de ${base.toFixed(0)}. Varios días así suelen ser fatiga acumulada, mal sueño o un catarro que viene: buena semana para bajar carga.`)
    else if (d <= -2) add('bien', `Pulso en reposo bajando: ${d.toFixed(0)} ppm`, `Esta semana ${m7.toFixed(0)} frente a ${base.toFixed(0)} de base: señal de buena forma aeróbica y buena recuperación.`)
    else add('bien', 'Pulso en reposo estable', `${m7.toFixed(0)} ppm, en tu línea (${base.toFixed(0)}).`)
  }

  const bb7 = vals(ult(7), 'bb')
  if (bb7.length >= 4) {
    const m = media(bb7)
    if (m < 50) add('mal', `Recargas poco: Body Battery ${m.toFixed(0)} al despertar`, 'Por debajo de 50 de media es que la noche no te está dando para lo que gastas de día. Mira el sueño y el estrés antes de subir la carga.')
    else if (m < 70) add('ojo', `Recarga a medias: ${m.toFixed(0)} al despertar`, 'Entre 50 y 70: vas tirando, pero sin reserva para semanas fuertes.')
    else add('bien', `Recargas bien: ${m.toFixed(0)} al despertar`, 'Por encima de 70: llegas descansado.')
  }

  const es7 = vals(ult(7), 'estres')
  if (es7.length >= 4) {
    const m = media(es7)
    if (m > 40) add('ojo', `Estrés alto: ${m.toFixed(0)} de media`, 'Garmin lo mide por la variabilidad del pulso: por encima de 40 de media tu cuerpo pasa mucho tiempo en tensión (exámenes, poco sueño, entrenos duros). Es lo que se come la Body Battery.')
  }

  const ac = filas[filas.length - 1]?.acwr
  if (ac != null) {
    if (ac > 1.5) add('mal', `Carga disparada: ${ac.toFixed(2)} veces tu habitual`, 'Por encima de 1,5 es la zona en la que se concentran las lesiones. Si no es una semana de competición buscada, baja algo.')
    else if (ac < 0.8) add('ojo', `Carga baja: ${ac.toFixed(2)} de tu habitual`, 'Bien si es descarga o puesta a punto; si dura, se pierde forma.')
    else add('bien', `Carga controlada: ${ac.toFixed(2)}`, 'Entre 0,8 y 1,3: subiendo o manteniendo sin sobresaltos.')
  }

  const cmj = vals(filas, 'cmjPre')
  if (cmj.length >= 6) {
    const ult3 = media(cmj.slice(-3))
    const base = media(cmj.slice(0, -3))
    const d = ((ult3 - base) / base) * 100
    if (d <= -5) add('mal', `CMJ bajando: ${d.toFixed(1)} %`, `Tus últimos saltos (${ult3.toFixed(1)} cm) están por debajo de tu media (${base.toFixed(1)}). Una caída del 5 % o más suele ser fatiga neuromuscular: mejor no meter calidad estos días.`)
    else if (d >= 3) add('bien', `CMJ en forma: +${d.toFixed(1)} %`, `Saltas ${ult3.toFixed(1)} cm frente a ${base.toFixed(1)} de media: buen momento para calidad o competir.`)
  }

  const orden = { mal: 0, ojo: 1, bien: 2 }
  return out.sort((a, b) => orden[a.tono] - orden[b.tono])
}
