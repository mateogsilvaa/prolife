/**
 * Lo que apuntas en la app de tu entrenador (RB Team), dentro de prolife.
 *
 * El entrenador da a cada atleta un token de solo lectura para SUS datos. Con
 * él, el servidor de este ordenador pide todo cada hora y lo mete en la base:
 *
 *  · el formulario de cada entreno → el entreno de ese día (RPE, minutos, CMJ,
 *    energía, ganas, sensaciones…). Si ya lo habías apuntado aquí, se completa
 *    ese mismo en vez de duplicarlo;
 *  · los tiempos de las series → `training[].reps`, como si los hubieras
 *    escrito a mano;
 *  · las molestias → `training[].pains` del día (con su EVA de 0 a 10);
 *  · el resto (sesiones asignadas, bloques, tests, marcas…) → `db.coach`, tal
 *    cual llega, para enseñarlo en Hoy, en el calendario y en Atletismo.
 *
 * Un registro que ya entró solo se vuelve a escribir si cambia en RB Team: así
 * lo que corrijas en prolife no se pisa en la siguiente vuelta.
 *
 * Funciones puras salvo `traer`, para poder probarlas sin red.
 */

export const RB_URL = 'https://rb-datos-atleta.ricardobrocop.workers.dev/v1/datos'

export async function traer(token, { fetchImpl = fetch } = {}) {
  let r
  try {
    r = await fetchImpl(RB_URL, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw new Error('No se pudo contactar con la app del entrenador (¿sin conexión?)')
  }
  const d = await r.json().catch(() => null)
  if (r.status === 401 || r.status === 403) {
    throw Object.assign(new Error('El token no vale o el entrenador ha retirado el acceso: pídele uno nuevo.'), { status: r.status })
  }
  if (!r.ok) throw new Error(d?.error?.message || `La app del entrenador ha contestado ${r.status}`)
  if (d?.formato !== 'rb-team-datos-atleta') throw new Error('La app del entrenador ha devuelto algo que no se entiende')
  return d
}

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const limpio = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''))

/** Los tipos del formulario del grupo, a los de prolife. */
const TIPOS = [
  [/gim|fuerza|pesas/i, 'Gimnasio'],
  [/compet/i, 'Competición'],
  [/t[eé]cnica/i, 'Técnica'],
  [/recuper|regener|descarga/i, 'Recuperación'],
  [/rodaje|continu|aer[oó]bic/i, 'Rodaje'],
  [/serie|velocidad|vallas|arrastre|mixto/i, 'Series'],
]
const palabras = (s) =>
  new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2))

/**
 * El tipo del formulario, en tus propios tipos de entreno: el que más palabras
 * comparta («Series medias/largas/vallas largas» → «Series medias / largas»).
 * Si ninguno se parece, el genérico de prolife que le toque.
 */
export function tipoDe(tipo, tuyos = []) {
  const p = palabras(tipo)
  let mejor = null
  let puntos = 0
  for (const t of tuyos) {
    const n = [...palabras(t)].filter((w) => p.has(w)).length
    if (n > puntos) { mejor = t; puntos = n }
  }
  if (mejor) return mejor
  const generico = TIPOS.find(([re]) => re.test(tipo || ''))?.[1]
  return tuyos.find((t) => generico && palabras(t).has(palabras(generico).values().next().value)) || generico || tipo || 'Series'
}

// El orden importa: «isquiotibial» contiene «tibia».
const ZONAS = [
  [/isquio/i, 'Isquiotibial'],
  [/pie|planta/i, 'Pie / planta'],
  [/tobillo/i, 'Tobillo'],
  [/aquil/i, 'Aquiles'],
  [/gemel|s[oó]leo|pantorr/i, 'Gemelo / sóleo'],
  [/tibia|periost|espinilla/i, 'Tibia (periostitis)'],
  [/rodilla|r[oó]tul|patel/i, 'Rodilla'],
  [/cu[aá]dr|quadr/i, 'Cuádriceps'],
  [/aductor|ingle/i, 'Aductor / ingle'],
  [/cadera|psoas|flexor/i, 'Cadera'],
  [/gl[uú]te/i, 'Glúteo'],
  [/lumbar|espalda baja/i, 'Lumbar'],
  [/espalda|dorsal/i, 'Espalda alta'],
  [/hombro/i, 'Hombro'],
  [/cuello|cervical/i, 'Cuello'],
]
export const zonaDe = (z) => ZONAS.find(([re]) => re.test(z || ''))?.[1] || 'Otra'

const pista = (type) => /serie|t[eé]cnica|compet|velocidad|vallas|arrastre|mixto/i.test(type || '')

/**
 * Tiempos escritos a mano en el formulario («20,6 - 20,1 - 19,7»), por si no
 * se apuntaron en la pantalla de series. La distancia sale de la notación
 * («5x150 r4'» → 150).
 */
export function repsDeTexto(series, tiempos) {
  const dist = String(series || '').match(/(?:\d+\s*[x×]\s*)+(\d{2,5})/i)?.[1]
  if (!dist || !tiempos) return []
  return String(tiempos)
    .split(/\s[-–]\s|[;/|]|\s{2,}|\n/)
    .map((t) => t.trim().replace(',', '.'))
    .filter((t) => /^\d+(?::\d{1,2})?(?:\.\d+)?$/.test(t))
    .map((time) => ({ dist, time, rest: '' }))
}

/**
 * De la respuesta de RB Team a operaciones sobre la base. Devuelve también un
 * resumen de lo que ha entrado, para enseñarlo en Ajustes.
 */
export function fusionar(db, datos, at = Date.now()) {
  const sec = datos?.secciones || {}
  const formularios = Array.isArray(sec.formularios) ? sec.formularios : []
  const series = Array.isArray(sec.series) ? sec.series : []
  const molestias = Array.isArray(sec.molestias) ? sec.molestias : []

  // Copia de trabajo de los entrenos: lo que se va tocando se compara al final
  // con lo que había, y solo se escribe lo que ha cambiado de verdad.
  const antes = new Map((db.training || []).map((t) => [t.id, t]))
  const trabajo = new Map([...antes].map(([id, t]) => [id, structuredClone(t)]))
  const usados = new Set()
  const resumen = { entrenos: 0, nuevos: 0, series: 0, molestias: 0 }

  const delDia = (fecha) => [...trabajo.values()].filter((t) => t.date === fecha)

  /* 1. Formularios: un entreno cada uno. */
  for (const f of [...formularios].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))) {
    if (!f?._id || !f.fecha) continue
    const type = tipoDe(f.tipo, db.settings?.trainingTypes)
    let t = delDia(f.fecha).find((x) => x.rb?.id === f._id)
    if (!t) {
      // Lo que ya habías apuntado en prolife ese día es el mismo entreno: se
      // completa en vez de duplicarlo. Primero el del mismo tipo; si no, el
      // único que hubiera (sin mezclar gimnasio con pista); y si el día estaba
      // como descanso, pasa a entreno.
      const libres = delDia(f.fecha).filter((x) => !x.rb && !usados.has(x.id))
      const gim = (x) => /gim|fuerza|pesas/i.test(x)
      const hechos = libres.filter((x) => x.done)
      t = hechos.find((x) => x.type === type) ||
        (hechos.length === 1 && gim(hechos[0].type) === gim(type) ? hechos[0] : null) ||
        (!hechos.length ? libres.find((x) => !x.done) : null)
      if (t) t.type = type
    }
    if (t?.rb?.id === f._id && t.rb.enviadoEn === f.enviadoEn) {
      usados.add(t.id)
      continue
    }
    if (!t) {
      t = { id: `rb_${f._id}`, date: f.fecha, done: true, type, minutes: 0, rpe: 0, cmjPre: '', cmjPost: '', notes: '', pains: [] }
      trabajo.set(t.id, t)
      resumen.nuevos++
    }
    usados.add(t.id)
    t.done = true
    if (num(f.rpeGeneral) != null) t.rpe = num(f.rpeGeneral)
    if (num(f.duracion) != null) t.minutes = num(f.duracion)
    if (num(f.cmjPre) != null) t.cmjPre = String(f.cmjPre)
    if (num(f.cmjPost) != null) t.cmjPost = String(f.cmjPost)
    t.rb = limpio({
      id: f._id,
      enviadoEn: f.enviadoEn,
      tipo: f.tipo,
      semana: num(f.semana),
      energia: num(f.energia),
      ganas: num(f.ganas),
      sensaciones: num(f.sensaciones),
      rpeSeries: num(f.rpeSeries),
      minSeries: num(f.duracionSeries),
      carga: num(f.cargaUA),
      series: f.seriesTexto || null,
      tiempos: f.tiemposTexto || null,
      zapatillas: f.zapatillas || null,
      comentario: f.comentario || null,
    })
    if (!(t.reps || []).length) {
      const reps = repsDeTexto(f.seriesTexto, f.tiemposTexto)
      if (reps.length) { t.reps = reps; t.rb.repsDe = 'formulario' }
    }
  }

  /* 2. Tiempos de las series: al entreno de pista de ese día. */
  for (const s of series) {
    if (!s?.fecha || !Array.isArray(s.reps)) continue
    const clave = s.sesionId || s.fecha
    const dia = delDia(s.fecha).filter((x) => x.done)
    let t = dia.find((x) => x.rb?.serie === clave) || dia.find((x) => pista(x.type) && x.rb) || dia.find((x) => pista(x.type))
    if (t?.rb?.serie === clave && t.rb.serieEn === (s.actualizadoEn || s.creadoEn)) continue
    if (!t) {
      t = { id: `rb_serie_${clave}`, date: s.fecha, done: true, type: 'Series', minutes: 0, rpe: num(s.rpe) || 0, cmjPre: '', cmjPost: '', notes: '', pains: [] }
      trabajo.set(t.id, t)
      resumen.nuevos++
    }
    // Lo que escribiste a mano aquí manda: solo se rellenan series vacías o
    // las que ya había traído RB Team.
    const propias = (t.reps || []).length && !t.rb?.repsDe
    if (!propias) {
      t.reps = s.reps
        .filter((r) => num(r.d) && num(r.t))
        .map((r) => limpio({ dist: String(r.d), time: String(r.t), rest: '', set: num(r.s), note: r.m || null }))
    }
    t.rb = limpio({ ...(t.rb || {}), serie: clave, serieEn: s.actualizadoEn || s.creadoEn, notacion: s.notacion })
    if (!propias) t.rb.repsDe = 'series'
    if (s.comentario && !String(t.notes || '').includes(s.comentario.trim())) {
      t.notes = [t.notes, s.comentario.trim()].filter(Boolean).join('\n')
    }
    resumen.series++
  }

  /* 3. Molestias: dentro del entreno de ese día (o de un día de descanso). */
  for (const m of molestias) {
    if (!m?._id || !m.fecha) continue
    const id = `rb_${m._id}`
    const eva = num(m.eva) ?? 0
    const zona = zonaDe(m.zonaOriginal || m.zona)
    const dolor = {
      id,
      zone: zona,
      side: '',
      level: eva,
      kind: eva >= 5 ? 'dolor' : 'molestia',
      when: 'durante',
      stopped: false,
      notes: [zona === 'Otra' ? m.zonaOriginal || m.zona : '', m.comentario].filter(Boolean).join(' · '),
      rb: true,
    }
    const dia = delDia(m.fecha)
    if (dia.some((x) => (x.pains || []).some((p) => p.id === id && igual(p, dolor)))) continue
    // La misma zona ya apuntada a mano ese día es la misma molestia.
    if (zona !== 'Otra' && dia.some((x) => (x.pains || []).some((p) => !p.rb && p.zone === zona))) continue
    let t = dia.find((x) => (x.pains || []).some((p) => p.id === id)) || dia.find((x) => x.done && x.rb) || dia.find((x) => x.done) || dia[0]
    if (!t) {
      t = { id: `rb_dia_${m.fecha}`, date: m.fecha, done: false, type: 'Descanso', minutes: 0, rpe: 0, cmjPre: '', cmjPost: '', notes: '', pains: [] }
      trabajo.set(t.id, t)
    }
    t.pains = [...(t.pains || []).filter((p) => p.id !== id), dolor]
    resumen.molestias++
  }

  const ops = []
  for (const [id, t] of trabajo) {
    if (igual(antes.get(id), t)) continue
    ops.push({ kind: 'cambio', op: 'poner', ruta: ['training'], valor: t, id: `rb-tr-${id}-${at}`, at })
    resumen.entrenos++
  }

  /* 4. Todo lo demás, tal cual, en `db.coach`. */
  const { formularios: _f, series: _s, molestias: _m, usoApp: _u, ...resto } = sec
  const coach = {
    atleta: datos.atleta?.nombre || '',
    actualizado: datos.datosActualizadosEn || datos.generadoEn || null,
    recuentos: datos.recuentos || {},
    avisos: datos.avisos || [],
    ...Object.fromEntries(Object.entries(resto).filter(([, v]) => v != null)),
  }
  // La fecha de la respuesta cambia en cada llamada: no cuenta como cambio.
  const sinFecha = (c) => ({ ...(c || {}), actualizado: null })
  if (!igual(sinFecha(db.coach), sinFecha(coach))) {
    ops.push({ kind: 'cambio', op: 'fijar', ruta: ['coach'], valor: coach, id: `rb-coach-${at}`, at })
  }
  return { ops, resumen }
}
