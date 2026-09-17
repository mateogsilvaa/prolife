/**
 * Llevar el horario de prolife a Google Calendar.
 *
 * La idea es la misma que gobierna el resto de la app: **un solo escritor**. En
 * la cuenta de Google se crea un calendario aparte, llamado «prolife», y ese lo
 * gobierna la app entera — lo llena, lo corrige y borra de ahí lo que sobra. Tu
 * calendario personal no se toca nunca, ni para leerlo se necesita más que
 * mirarlo. Así no hay conflictos que resolver: no hay dos manos escribiendo lo
 * mismo.
 *
 * Sincronizar es **reconciliar**, no ir apuntando cambios: se calcula cómo
 * tendría que estar el calendario según el `db.json` de ahora, se mira cómo
 * está, y se corrige la diferencia. Eso lo hace idempotente —sincronizar dos
 * veces seguidas no cambia nada la segunda— y hace que no haga falta recordar
 * qué se mandó la vez anterior. Que sea así es lo que permite además
 * sincronizar desde los DOS ordenadores: el identificador de cada evento se
 * deduce de la cosa que representa (ver `idDeEvento`), así que los dos calculan
 * el mismo y el segundo actualiza en vez de duplicar.
 *
 * Las clases no van una a una sino como **eventos que se repiten**, con su
 * regla semanal y su fecha de fin. Un curso son cientos de clases y mandarlas
 * sueltas sería castigar la API para nada; además, así se ven en Google como lo
 * que son. Los festivos entran como excepciones de esa repetición: el día que
 * marcas festivo, la clase desaparece también del móvil.
 */
import {
  calendarioDeProlife, eventosDeProlife, crearEvento, cambiarEvento, borrarEvento,
  idDeEvento, zonaHoraria,
} from './gcal.js'

/* ----------------------------------------------------------------- fechas */

const iso = (d) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
const parseIso = (s) => new Date(`${s}T12:00:00`)
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12)
/** Lunes = 0, como en toda la app. */
const weekday = (d) => (d.getDay() + 6) % 7
const hoy = () => iso(new Date())
const compacta = (fecha, hora) => `${fecha.replace(/-/g, '')}T${(hora || '00:00').replace(':', '')}00`

/** Suma minutos a un «HH:MM». Sirve para dar fin a lo que no lo trae. */
function masMinutos(hora, minutos) {
  const [h, m] = String(hora || '00:00').split(':').map(Number)
  const t = h * 60 + m + minutos
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/* ------------------------------------------------------ qué se sincroniza */

export const AJUSTES_POR_DEFECTO = {
  /** Las clases del horario, con sus festivos descontados. */
  classes: true,
  /** Exámenes y entregas evaluables. */
  exams: true,
  /** Los eventos que apuntas en el calendario de prolife. */
  events: true,
  /** Las tareas con fecha, como eventos de día entero. */
  tasks: false,
  /** Los entrenos ya hechos. */
  training: false,
}

/** Hasta dónde se mira hacia atrás y hacia delante para lo que tiene fecha suelta. */
const ATRAS = 60
const ADELANTE = 400

/* --------------------------------------------------------- los eventos */

const hora = (fecha, h, tz) => ({ dateTime: `${fecha}T${h}:00`, timeZone: tz })
const diaEntero = (fecha) => ({ date: fecha })
/** Google trata el fin de un evento de día entero como exclusivo. */
const diaSiguiente = (fecha) => ({ date: iso(addDays(parseIso(fecha), 1)) })

/**
 * El rango de una clase, resuelto igual que en la interfaz: manda el
 * cuatrimestre si lo tiene, si no sus fechas, y si no las del curso.
 */
function rangoDeClase(slot, db) {
  const term = (db.terms || []).find((t) => t.id === slot.term)
  if (term) return { from: term.from || '', until: term.to || '' }
  return { from: slot.from || db.settings?.termStart || '', until: slot.until || db.settings?.termEnd || '' }
}

/** Los festivos que caen en ese día de la semana dentro del rango de la clase. */
function festivosDeLaClase(db, slot, from, until) {
  const fuera = []
  for (const h of db.holidays || []) {
    const desde = h.from < from ? from : h.from
    const hasta = (h.to || h.from) > until ? until : h.to || h.from
    if (desde > hasta) continue
    for (let d = parseIso(desde); iso(d) <= hasta; d = addDays(d, 1)) {
      if (weekday(d) === slot.day) fuera.push(iso(d))
    }
  }
  return fuera
}

/** La primera fecha en la que toca esa clase, contando desde el principio del rango. */
function primeraClase(from, dia) {
  let d = parseIso(from)
  for (let i = 0; i < 7; i++) {
    if (weekday(d) === dia) return iso(d)
    d = addDays(d, 1)
  }
  return from
}

const DIAS_RRULE = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

/**
 * Cómo tendría que estar el calendario de prolife, según la base de datos.
 *
 * Devuelve un mapa de identificador → evento tal y como lo quiere Google. Es
 * una función pura: no habla con nadie, así que se puede probar entera sin
 * tocar la red, que es justo lo que hace falta para fiarse de lo que borra.
 */
export function eventosDeseados(db, { ajustes = {}, desde = null, hasta = null } = {}) {
  const on = { ...AJUSTES_POR_DEFECTO, ...(db.settings?.gcal || {}), ...ajustes }
  const tz = zonaHoraria()
  const ventanaDesde = desde || iso(addDays(new Date(), -ATRAS))
  const ventanaHasta = hasta || iso(addDays(new Date(), ADELANTE))
  const enVentana = (f) => f >= ventanaDesde && f <= ventanaHasta
  const out = new Map()
  const pon = (clave, evento) => out.set(idDeEvento(clave), { ...evento, id: idDeEvento(clave) })

  if (on.classes) {
    for (const s of db.subjects || []) {
      ;(s.schedule || []).forEach((slot, i) => {
        const { from, until } = rangoDeClase(slot, db)
        // Sin fecha de fin la clase se repetiría para siempre también en Google,
        // y eso es basura que luego hay que limpiar a mano desde el móvil.
        if (!from || !until || until < from) return
        const arranque = primeraClase(from, slot.day)
        if (arranque > until) return

        const recurrence = [`RRULE:FREQ=WEEKLY;BYDAY=${DIAS_RRULE[slot.day]};UNTIL=${until.replace(/-/g, '')}T235959Z`]
        const fuera = festivosDeLaClase(db, slot, arranque, until)
        // Una sola línea con todas: Google admite varias fechas por EXDATE y
        // así el evento no lleva veinte líneas de excepciones.
        if (fuera.length) {
          recurrence.push(`EXDATE;TZID=${tz}:${fuera.map((f) => compacta(f, slot.start)).join(',')}`)
        }
        pon(`clase:${s.id}:${i}`, {
          summary: s.name,
          location: slot.room || '',
          description: [s.code, s.professor].filter(Boolean).join(' · '),
          start: hora(arranque, slot.start || '09:00', tz),
          end: hora(arranque, slot.end || masMinutos(slot.start || '09:00', 60), tz),
          recurrence,
        })
      })
    }
  }

  if (on.exams) {
    for (const e of db.exams || []) {
      if (!e.date || !enVentana(e.date)) continue
      const s = (db.subjects || []).find((x) => x.id === e.subjectId)
      const titulo = `${e.title || 'Examen'}${s ? ` · ${s.name}` : ''}`
      pon(`examen:${e.id}`, {
        summary: titulo,
        location: e.room || '',
        description: e.notes || '',
        ...(e.start
          ? { start: hora(e.date, e.start, tz), end: hora(e.date, e.end || masMinutos(e.start, 90), tz) }
          : { start: diaEntero(e.date), end: diaSiguiente(e.date) }),
      })
    }
  }

  if (on.events) {
    for (const ev of db.events || []) {
      if (!ev.date) continue
      // Los que se repiten van con su regla; los sueltos, solo si caen en la
      // ventana. Una repetición que empezó hace dos años sigue valiendo hoy.
      const repetido = !!ev.repeat?.freq
      if (!repetido && !enVentana(ev.date)) continue
      const cat = (db.categories || []).find((c) => c.id === ev.categoryId)
      const evento = {
        summary: ev.title || 'Evento',
        location: ev.location || '',
        description: [cat?.name, ev.notes].filter(Boolean).join('\n'),
        ...(ev.start
          ? { start: hora(ev.date, ev.start, tz), end: hora(ev.date, ev.end || masMinutos(ev.start, 60), tz) }
          : { start: diaEntero(ev.date), end: diaSiguiente(ev.date) }),
      }
      const regla = rruleDe(ev, tz)
      if (regla) evento.recurrence = regla
      pon(`evento:${ev.id}`, evento)
    }
  }

  if (on.tasks) {
    for (const t of db.tasks || []) {
      if (!t.due || t.status === 'done' || !enVentana(t.due)) continue
      const ref = (db.subjects || []).find((x) => x.id === t.refId) || (db.projects || []).find((x) => x.id === t.refId)
      pon(`tarea:${t.id}`, {
        summary: `Entregar: ${t.title}${ref ? ` · ${ref.name}` : ''}`,
        description: t.notes || '',
        start: diaEntero(t.due),
        end: diaSiguiente(t.due),
      })
    }
  }

  if (on.training) {
    for (const e of db.training || []) {
      if (!e.date || !enVentana(e.date)) continue
      pon(`entreno:${e.id}`, {
        summary: `Entreno: ${e.type || 'sesión'}`,
        description: [e.notes, e.minutes ? `${e.minutes} min` : '', e.rpe ? `RPE ${e.rpe}` : ''].filter(Boolean).join(' · '),
        start: diaEntero(e.date),
        end: diaSiguiente(e.date),
      })
    }
  }

  return out
}

/** La repetición de un evento de prolife, en el idioma de iCalendar. */
function rruleDe(ev, tz) {
  const r = ev.repeat
  if (!r?.freq) return null
  const freq = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[r.freq]
  if (!freq) return null
  const partes = [`FREQ=${freq}`]
  if (r.interval > 1) partes.push(`INTERVAL=${r.interval}`)
  if (r.freq === 'weekly' && r.byday?.length) partes.push(`BYDAY=${r.byday.map((d) => DIAS_RRULE[d]).join(',')}`)
  if (r.until) partes.push(`UNTIL=${r.until.replace(/-/g, '')}T235959Z`)
  const out = [`RRULE:${partes.join(';')}`]
  if (ev.exceptions?.length) {
    out.push(
      ev.start
        ? `EXDATE;TZID=${tz}:${ev.exceptions.map((f) => compacta(f, ev.start)).join(',')}`
        : `EXDATE;VALUE=DATE:${ev.exceptions.map((f) => f.replace(/-/g, '')).join(',')}`
    )
  }
  return out
}

/* ------------------------------------------------------------ reconciliar */

/** Los campos que gobierna prolife. Lo demás del evento es de Google y no se mira. */
const NUESTROS = ['summary', 'location', 'description', 'start', 'end', 'recurrence']

const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

const distinto = (quiero, hay) =>
  NUESTROS.some((k) => {
    if (k === 'start' || k === 'end') {
      // Google devuelve el `timeZone` aunque no se lo mandes, y a veces añade
      // el desfase a la hora: se comparan las dos piezas que sí son nuestras.
      return (quiero[k]?.date || '') !== (hay[k]?.date || '') ||
        (quiero[k]?.dateTime || '').slice(0, 19) !== (hay[k]?.dateTime || '').slice(0, 19)
    }
    return !igual(quiero[k] || (k === 'recurrence' ? undefined : ''), hay[k] || (k === 'recurrence' ? undefined : ''))
  })

/**
 * Deja el calendario de Google como dice la base de datos.
 *
 * Lo que sobra se borra, y por eso importa tanto que el calendario sea suyo:
 * aquí dentro, «sobra» significa «prolife lo puso y ya no toca», nunca «no sé
 * qué es esto». Devuelve la cuenta de lo que ha hecho para poder decírselo al
 * usuario sin adornos.
 */
export async function sincronizar(db, { ajustes } = {}) {
  const calendarId = await calendarioDeProlife()
  const quiero = eventosDeseados(db, { ajustes })
  const hay = new Map((await eventosDeProlife(calendarId)).map((e) => [e.id, e]))

  let creados = 0
  let cambiados = 0
  let borrados = 0
  const fallos = []

  for (const [id, evento] of quiero) {
    const actual = hay.get(id)
    try {
      if (!actual) {
        await crearEvento(calendarId, evento)
        creados++
      } else if (distinto(evento, actual)) {
        await cambiarEvento(calendarId, id, evento)
        cambiados++
      }
    } catch (e) {
      // Un evento que Google rechaza no puede tumbar la tanda entera: se apunta
      // y se sigue, igual que una operación mala no tumba el buzón.
      fallos.push({ id, error: e.message })
    }
  }

  for (const id of hay.keys()) {
    if (quiero.has(id)) continue
    // Solo lo que puso prolife: si alguna vez alguien mete algo a mano en ese
    // calendario, no es nuestro y no se toca.
    if (!id.startsWith('prolife')) continue
    try {
      await borrarEvento(calendarId, id)
      borrados++
    } catch (e) {
      fallos.push({ id, error: e.message })
    }
  }

  return { ok: true, calendarId, creados, cambiados, borrados, total: quiero.size, fallos, at: Date.now() }
}

export { iso as isoDeFecha, hoy }
