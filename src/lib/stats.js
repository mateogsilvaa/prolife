import { iso, addDays, startOfWeek, weekday, today, parseIso } from './date.js'
import { AREAS } from './store.jsx'

/** Resumen de una semana concreta (lunes → domingo). */
export function weekSummary(db, monday) {
  const start = iso(monday)
  const end = iso(addDays(monday, 6))
  const sessions = db.sessions.filter((s) => s.date >= start && s.date <= end)

  const byArea = Object.fromEntries(Object.keys(AREAS).map((k) => [k, 0]))
  const byRef = new Map()
  const byDay = Array(7).fill(0)

  for (const s of sessions) {
    byArea[s.area] = (byArea[s.area] || 0) + s.seconds
    const key = `${s.area}:${s.refId || '-'}`
    byRef.set(key, (byRef.get(key) || 0) + s.seconds)
    byDay[weekday(parseIso(s.date))] += s.seconds
  }

  const total = sessions.reduce((a, s) => a + s.seconds, 0)
  const tasksDone = db.tasks.filter(
    (t) => t.doneAt && iso(new Date(t.doneAt)) >= start && iso(new Date(t.doneAt)) <= end
  ).length
  const attended = db.attendance.filter((a) => a.date >= start && a.date <= end)

  const trainings = (db.training || []).filter((t) => t.done && t.date >= start && t.date <= end)
  const trainingLoad = trainings.reduce((a, t) => a + (Number(t.rpe) || 0) * (Number(t.minutes) || 0), 0)

  return {
    start, end, sessions, total, byArea, byRef, byDay, tasksDone,
    trainings: trainings.length, trainingLoad,
    activeDays: byDay.filter((d) => d > 0).length,
    best: byDay.indexOf(Math.max(...byDay)),
    classes: attended.length,
    present: attended.filter((a) => a.status === 'present' || a.status === 'late').length,
  }
}

/** Últimas `n` semanas, de la más antigua a la actual. */
export function recentWeeks(db, n = 8, from = new Date()) {
  const base = startOfWeek(from)
  const out = []
  for (let i = n - 1; i >= 0; i--) out.push(weekSummary(db, addDays(base, -7 * i)))
  return out
}

export function delta(cur, prev) {
  if (!prev) return null
  if (prev === 0) return cur > 0 ? 1 : 0
  return (cur - prev) / prev
}

export const pct = (x) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`

/* ------------------------------------------------------------------ horario */

/* ------------------------------------------------- cuatrimestres y festivos */

/** El cuatrimestre con ese id, si sigue existiendo. */
export const termById = (db, id) => (id ? (db.terms || []).find((t) => t.id === id) || null : null)

/**
 * ¿Qué festivo cae en esta fecha? Devuelve el que sea, o `null`.
 *
 * Los festivos se guardan como rangos con un día de principio y otro de fin,
 * que es lo que hace falta para Navidad o Semana Santa. Un día suelto es un
 * rango de un día: una sola forma de guardarlo, en vez de dos casos.
 */
export function holidayOn(db, date) {
  return (db.holidays || []).find((h) => date >= h.from && date <= (h.to || h.from)) || null
}

/** Los festivos que caen dentro de un rango, ordenados. */
export function holidaysBetween(db, from, to) {
  return (db.holidays || [])
    .filter((h) => (h.to || h.from) >= from && h.from <= to)
    .sort((a, b) => a.from.localeCompare(b.from))
}

/**
 * Rango de fechas en el que se imparte una clase.
 *
 * Tres orígenes, por orden: el cuatrimestre al que la clase diga que pertenece,
 * sus propias fechas, y las del curso. El cuatrimestre va primero porque es lo
 * que permite tener una asignatura anual sin repetir fechas en cada fila: sus
 * clases del primero valen hasta que acaba el primero, las del segundo empiezan
 * cuando empieza el segundo, y en medio —exámenes y vacaciones— no hay clase.
 */
export function slotRange(slot, db = {}) {
  const settings = db.settings || db
  const term = termById(db, slot?.term)
  if (term) return { from: term.from || '', until: term.to || '' }
  return {
    from: slot?.from || settings.termStart || '',
    until: slot?.until || settings.termEnd || '',
  }
}

/**
 * ¿Hay esta clase este día?
 *
 * Aquí es donde entran los festivos, y a propósito: si el festivo se mirara en
 * cada pantalla por separado, el calendario, la asistencia y el ayudante
 * acabarían discrepando el día que a alguien se le olvidara mirarlo. Una clase
 * que no existe no se agenda, no se puede faltar a ella y no cuenta para la
 * asistencia, que es justo lo que uno espera de un festivo.
 */
export function slotActiveOn(slot, date, db = {}) {
  return slotInRange(slot, date, db) && !holidayOn(db, date)
}

/** Lo mismo pero sin mirar los festivos: si toca por calendario y punto. */
export function slotInRange(slot, date, db = {}) {
  const { from, until } = slotRange(slot, db)
  if (from && date < from) return false
  if (until && date > until) return false
  return true
}

/**
 * Cuántas clases habría entre dos fechas SI NO hubiera festivos.
 *
 * Es lo que permite enseñar, al marcar un festivo, cuántas clases quita: con
 * `classOccurrences` saldría cero, porque ese ya se los salta. Ver el número
 * antes de guardar es lo que avisa de que te has equivocado de fecha.
 */
export function classesBetween(db, from, to) {
  if (!from || !to || to < from) return 0
  let n = 0
  for (let d = parseIso(from); iso(d) <= to; d = addDays(d, 1)) {
    const date = iso(d)
    const wd = weekday(d)
    for (const s of db.subjects || []) {
      for (const slot of s.schedule || []) {
        if (slot.day === wd && slotInRange(slot, date, db)) n++
      }
    }
  }
  return n
}

/** ¿Hay alguna clase sin fecha de fin? Entonces el horario no termina nunca. */
export function hasEndlessSlots(db) {
  return db.subjects.some((s) => (s.schedule || []).some((sl) => !slotRange(sl, db).until))
}

/**
 * Todas las clases de una asignatura entre dos fechas, en orden. `slotIndex` es
 * la posición dentro del horario: es la clave con la que se guarda la asistencia.
 */
export function classOccurrences(db, subject, from, to) {
  const slots = subject?.schedule || []
  if (!slots.length) return []
  const out = []
  for (let d = parseIso(from); iso(d) <= to; d = addDays(d, 1)) {
    const date = iso(d)
    const wd = weekday(d)
    slots.forEach((slot, slotIndex) => {
      if (slot.day === wd && slotActiveOn(slot, date, db)) {
        out.push({ date, slot, slotIndex, subject })
      }
    })
  }
  return out
}

/** Ventana del curso: lo que diga Ajustes o, en su defecto, algo razonable. */
export function termWindow(db) {
  return {
    from: db.settings.termStart || iso(addDays(new Date(), -120)),
    to: db.settings.termEnd || iso(addDays(new Date(), 120)),
  }
}

/* -------------------------------------------------------------- asistencia */

/**
 * Cuántas clases puedes seguir faltando. Necesita saber cuántas clases tiene la
 * asignatura en total, y eso solo se puede contar si el horario tiene fechas.
 */
export function attendanceBudget(db, subjectId) {
  const subject = db.subjects.find((s) => s.id === subjectId)
  const minRate = subject?.attendanceMin ?? db.settings.attendanceMin ?? 0.7
  const { from, to } = termWindow(db)
  const all = classOccurrences(db, subject, from, to)
  const rows = db.attendance.filter((a) => a.subjectId === subjectId)
  const statusAt = (o) => rows.find((a) => a.date === o.date && a.slot === o.slotIndex)?.status || null

  const past = all.filter((o) => o.date <= today())
  const upcoming = all.filter((o) => o.date > today())
  // Las justificadas no cuentan ni a favor ni en contra: salen del denominador.
  const excused = past.filter((o) => statusAt(o) === 'excused').length
  const attended = past.filter((o) => ['present', 'late'].includes(statusAt(o))).length
  const absences = past.filter((o) => statusAt(o) === 'absent').length
  const unmarked = past.filter((o) => !statusAt(o)).length

  const totalCounted = all.length - excused
  // Redondeo prudente: si exigen el 70%, hay que asistir a la parte entera hacia arriba.
  const mustAttend = Math.ceil(totalCounted * minRate)
  const maxAbsences = Math.max(0, totalCounted - mustAttend)

  return {
    subject, minRate, total: all.length, totalCounted,
    past: past.length, upcoming: upcoming.length, unmarked,
    attended, absences, excused,
    maxAbsences,
    /** Faltas que aún te puedes permitir sin bajar del mínimo. */
    left: Math.max(0, maxAbsences - absences),
    /**
     * ¿Es ya imposible llegar al mínimo? Solo lo deciden las faltas que
     * CONSTAN. Una clase pasada sin marcar es una incógnita, no una falta: darla
     * por perdida hacía que la app dijera «sin margen» —y el ayudante «ya no
     * llegas»— a quien no ha faltado a ninguna y solo lleva el registro flojo,
     * contradiciendo al `left` de al lado. Lo que falta por marcar se cuenta
     * aparte, en `unmarked`, y la pantalla lo avisa por su cuenta.
     */
    doomed: totalCounted - absences < mustAttend,
    mustAttend,
    /** Sin fechas de fin no se puede contar el total, así que el cálculo no vale. */
    reliable: (subject?.schedule || []).every((sl) => slotRange(sl, db).until),
    nextClass: upcoming[0] || null,
  }
}

/* ---------------------------------------------------------------- semana */

/** Horas que cuentan como el 100% semanal de una asignatura. */
export function weeklyGoalHours(db, subject) {
  if (subject?.weeklyGoalHours > 0) return subject.weeklyGoalHours
  // Regla de la casa: un ECTS son 25–30 h de trabajo total; repartidas en 15
  // semanas salen ~1,7 h por crédito y semana, de las que la mitad son clase.
  if (subject?.credits > 0) return Math.round(subject.credits * 0.9 * 10) / 10
  return 4
}

/**
 * El «trabajo semanal realizado». Mezcla dos cosas que se miran distinto:
 * las horas dedicadas y las entregas que vencían esta semana. Si no vence
 * nada, el porcentaje son solo las horas.
 */
export function subjectWeek(db, subjectId, monday = startOfWeek(new Date())) {
  const subject = db.subjects.find((s) => s.id === subjectId)
  const start = iso(monday)
  const end = iso(addDays(monday, 6))

  const seconds = db.sessions
    .filter((s) => s.refId === subjectId && s.date >= start && s.date <= end)
    .reduce((a, s) => a + s.seconds, 0)
  const goal = weeklyGoalHours(db, subject)
  const hoursPct = goal > 0 ? Math.min(1, seconds / 3600 / goal) : 0

  const dueThisWeek = db.tasks.filter((t) => t.refId === subjectId && t.due >= start && t.due <= end)
  const doneThisWeek = dueThisWeek.filter((t) => t.status === 'done').length
  const tasksPct = dueThisWeek.length ? doneThisWeek / dueThisWeek.length : null

  const pct = tasksPct === null ? hoursPct : hoursPct * 0.6 + tasksPct * 0.4

  return {
    subject, start, end, seconds, goal, hoursPct, tasksPct,
    tasks: dueThisWeek.length, tasksDone: doneThisWeek,
    pct: Math.round(pct * 100),
  }
}

/** Lo mismo para todo el curso: la media ponderada por horas objetivo. */
export function weekProgress(db, monday = startOfWeek(new Date())) {
  const rows = db.subjects.map((s) => subjectWeek(db, s.id, monday))
  const goal = rows.reduce((a, r) => a + r.goal, 0) || db.settings.weeklyGoalHours || 25
  const seconds = rows.reduce((a, r) => a + r.seconds, 0)
  const tasks = rows.reduce((a, r) => a + r.tasks, 0)
  const tasksDone = rows.reduce((a, r) => a + r.tasksDone, 0)

  const hoursPct = Math.min(1, seconds / 3600 / goal)
  const tasksPct = tasks ? tasksDone / tasks : null
  const pct = tasksPct === null ? hoursPct : hoursPct * 0.6 + tasksPct * 0.4

  return { rows, goal, seconds, tasks, tasksDone, hoursPct, tasksPct, pct: Math.round(pct * 100) }
}

/* ---------------------------------------------------------- asignaturas */

/** Estado de una asignatura: asistencia, horas, tareas abiertas, exámenes. */
export function subjectStats(db, subjectId) {
  const rows = db.attendance.filter((a) => a.subjectId === subjectId)
  const counted = rows.filter((a) => a.status !== 'excused')
  const attended = counted.filter((a) => a.status === 'present' || a.status === 'late').length
  const seconds = db.sessions.filter((s) => s.refId === subjectId).reduce((a, s) => a + s.seconds, 0)
  const open = db.tasks.filter((t) => t.refId === subjectId && t.status !== 'done')
  const exams = (db.exams || [])
    .filter((e) => e.subjectId === subjectId)
    .sort((a, b) => (a.date || 'z').localeCompare(b.date || 'z'))
  const nextExam = exams.find((e) => e.date >= today()) || null

  return {
    rows,
    total: counted.length,
    attended,
    rate: counted.length ? attended / counted.length : null,
    absences: counted.filter((a) => a.status === 'absent').length,
    seconds,
    open,
    exams,
    nextExam,
    week: subjectWeek(db, subjectId),
    nextDue: open.filter((t) => t.due).sort((a, b) => a.due.localeCompare(b.due))[0] || null,
  }
}

/** Clases previstas hoy según el horario semanal de cada asignatura. */
export function classesOn(db, date = today()) {
  const wd = weekday(parseIso(date))
  const out = []
  for (const s of db.subjects) {
    // slotIndex es la posición dentro del horario de la asignatura: es la clave
    // con la que se guarda la asistencia, no la posición en esta lista.
    ;(s.schedule || []).forEach((slot, slotIndex) => {
      if (slot.day === wd && slotActiveOn(slot, date, db)) out.push({ subject: s, slot, slotIndex })
    })
  }
  return out.sort((a, b) => (a.slot.start || '').localeCompare(b.slot.start || ''))
}

/** Exámenes y entregas evaluables que vienen, ordenados por fecha. */
export function upcomingExams(db, days = 60) {
  const limit = iso(addDays(new Date(), days))
  return (db.exams || [])
    .filter((e) => e.date >= today() && e.date <= limit)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''))
    .map((e) => ({ ...e, subject: db.subjects.find((s) => s.id === e.subjectId) || null }))
}

export function streak(db) {
  let n = 0
  for (let i = 0; i < 400; i++) {
    const d = iso(addDays(new Date(), -i))
    const has = db.sessions.some((s) => s.date === d && s.seconds > 300)
    if (has) n++
    else if (i > 0) break
  }
  return n
}
