import { iso, addDays, startOfWeek, parseIso, weekday, today } from './date.js'
import { AREAS } from './store.jsx'
import { attendanceBudget, isDeliverable } from './stats.js'

/**
 * Los números de cada área, contados una vez. Los usan la pantalla de
 * Estadísticas y el informe que se exporta desde Ajustes: que salgan del mismo
 * sitio es lo que garantiza que digan lo mismo.
 */

const sum = (xs, f) => xs.reduce((a, x) => a + (f ? f(x) : x), 0)

/* ------------------------------------------------------------ universidad */

/** La nota provisional de una asignatura: media ponderada de lo ya evaluado. */
export function gradeOf(db, subjectId) {
  const exams = (db.exams || []).filter((e) => e.subjectId === subjectId)
  const graded = exams.filter((e) => e.grade != null && e.weight > 0)
  const weightDone = sum(graded, (e) => Number(e.weight) || 0)
  return {
    exams,
    grade: weightDone ? sum(graded, (e) => e.grade * e.weight) / weightDone : null,
    weightDone,
    weightTotal: sum(exams, (e) => Number(e.weight) || 0),
  }
}

export function uniStats(db) {
  const hace28 = iso(addDays(new Date(), -27))
  const rows = db.subjects.map((s) => {
    const sess = db.sessions.filter((x) => x.refId === s.id)
    const att = db.attendance.filter((a) => a.subjectId === s.id)
    const marked = att.filter((a) => !['excused', 'cancelled'].includes(a.status))
    const present = marked.filter((a) => a.status === 'present' || a.status === 'late').length
    const g = gradeOf(db, s.id)
    const b = attendanceBudget(db, s.id)
    const deliverables = g.exams.filter(isDeliverable)
    return {
      subject: s,
      seconds: sum(sess, (x) => x.seconds),
      seconds28: sum(sess.filter((x) => x.date >= hace28), (x) => x.seconds),
      attendance: marked.length ? present / marked.length : null,
      present, marked: marked.length,
      absent: att.filter((a) => a.status === 'absent').length,
      late: att.filter((a) => a.status === 'late').length,
      excused: att.filter((a) => a.status === 'excused').length,
      cancelled: att.filter((a) => a.status === 'cancelled').length,
      budget: b,
      ...g,
      delivered: deliverables.filter((e) => e.delivered).length,
      deliverables: deliverables.length,
      openTasks: db.tasks.filter((t) => t.refId === s.id && t.status !== 'done').length,
      doneTasks: db.tasks.filter((t) => t.refId === s.id && t.status === 'done').length,
    }
  })
  const graded = rows.filter((r) => r.grade != null)
  const marked = sum(rows, (r) => r.marked)
  const present = sum(rows, (r) => r.present)
  return {
    rows: rows.sort((a, b) => b.seconds - a.seconds),
    seconds: sum(rows, (r) => r.seconds),
    attendance: marked ? present / marked : null,
    marked, present,
    absent: sum(rows, (r) => r.absent),
    cancelled: sum(rows, (r) => r.cancelled),
    avgGrade: graded.length ? sum(graded, (r) => r.grade) / graded.length : null,
    // Media ponderada por créditos, que es como la calcula la universidad.
    creditsGrade: (() => {
      const conCreditos = graded.filter((r) => r.subject.credits > 0)
      const c = sum(conCreditos, (r) => r.subject.credits)
      return c ? sum(conCreditos, (r) => r.grade * r.subject.credits) / c : null
    })(),
    atRisk: rows.filter((r) => r.budget.totalCounted > 0 && (r.budget.doomed || r.budget.left <= 1)),
  }
}

/* ------------------------------------------------------------------ tiempo */

export function timeStats(db) {
  const s = db.sessions
  const byDate = new Map()
  for (const x of s) byDate.set(x.date, (byDate.get(x.date) || 0) + x.seconds)

  const byArea = Object.fromEntries(Object.keys(AREAS).map((k) => [k, 0]))
  for (const x of s) byArea[x.area] = (byArea[x.area] || 0) + x.seconds

  // Por día de la semana: la media de los días que hubo algo, no del total, o
  // los domingos en blanco hundirían cualquier comparación.
  const wdTotal = Array(7).fill(0)
  const wdDays = Array(7).fill(0)
  for (const [d, secs] of byDate) {
    const wd = weekday(parseIso(d))
    wdTotal[wd] += secs
    wdDays[wd]++
  }

  // A qué hora trabajas: solo los tramos medidos de verdad, que llevan su
  // hora de inicio. Los apuntados a mano no dicen nada de eso.
  const byHour = Array(24).fill(0)
  for (const x of s) {
    if (x.source === 'manual' || !x.start || !x.end) continue
    let t = x.start
    while (t < x.end) {
      const h = new Date(t).getHours()
      const next = Math.min(x.end, new Date(t).setMinutes(60, 0, 0))
      byHour[h] += (next - t) / 1000
      t = next
    }
  }

  const now = new Date()
  const months = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const list = s.filter((x) => x.date.startsWith(key))
    const ar = Object.fromEntries(Object.keys(AREAS).map((k) => [k, 0]))
    for (const x of list) ar[x.area] = (ar[x.area] || 0) + x.seconds
    months.push({ key, month: d.getMonth(), year: d.getFullYear(), seconds: sum(list, (x) => x.seconds), byArea: ar })
  }

  // Racha más larga de días con más de 5 minutos.
  const dias = [...byDate.entries()].filter(([, v]) => v > 300).map(([d]) => d).sort()
  let best = 0
  let run = 0
  let prev = null
  for (const d of dias) {
    run = prev && iso(addDays(parseIso(prev), 1)) === d ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }

  const bestDay = [...byDate.entries()].sort((a, b) => b[1] - a[1])[0] || null
  const total = sum(s, (x) => x.seconds)
  return {
    total, byArea, byHour, months,
    activeDays: byDate.size,
    avgActiveDay: byDate.size ? total / byDate.size : 0,
    wdAvg: wdTotal.map((t, i) => (wdDays[i] ? t / wdDays[i] : 0)),
    wdTotal,
    bestDay,
    bestStreak: best,
    first: dias[0] || null,
    peakHour: byHour.some((x) => x) ? byHour.indexOf(Math.max(...byHour)) : null,
  }
}

/* ------------------------------------------------------------------ tareas */

export function taskStats(db) {
  const done = db.tasks.filter((t) => t.status === 'done' && t.doneAt)
  const withDue = done.filter((t) => t.due)
  const late = withDue.filter((t) => iso(new Date(t.doneAt)) > t.due)
  const delays = late.map((t) => Math.round((parseIso(iso(new Date(t.doneAt))) - parseIso(t.due)) / 86400000))

  const weeks = []
  const base = startOfWeek(new Date())
  for (let i = 11; i >= 0; i--) {
    const start = iso(addDays(base, -7 * i))
    const end = iso(addDays(parseIso(start), 6))
    weeks.push({
      start,
      done: done.filter((t) => { const d = iso(new Date(t.doneAt)); return d >= start && d <= end }).length,
      created: db.tasks.filter((t) => t.createdAt && iso(new Date(t.createdAt)) >= start && iso(new Date(t.createdAt)) <= end).length,
    })
  }

  const byArea = Object.keys(AREAS).map((k) => ({
    area: k,
    open: db.tasks.filter((t) => t.area === k && t.status !== 'done').length,
    done: done.filter((t) => t.area === k).length,
  }))

  const ev = (db.exams || []).filter(isDeliverable)
  const evDone = ev.filter((e) => e.delivered)
  const evLate = evDone.filter((e) => e.deliveredAt && iso(new Date(e.deliveredAt)) > e.date)

  return {
    total: db.tasks.length,
    open: db.tasks.filter((t) => t.status !== 'done').length,
    overdue: db.tasks.filter((t) => t.status !== 'done' && t.due && t.due < today()).length,
    done: done.length,
    onTime: withDue.length ? (withDue.length - late.length) / withDue.length : null,
    late: late.length,
    avgDelay: delays.length ? sum(delays) / delays.length : 0,
    weeks, byArea,
    deliverables: ev.length,
    delivered: evDone.length,
    deliveredLate: evLate.length,
    pendingDeliverables: ev.length - evDone.length,
  }
}

/* ----------------------------------------------------------- voluntariado */

export function volunteerSummary(db) {
  const dias = db.volunteerDays || []
  const minutes = sum(dias, (d) => Number(d.minutes) || 0)
  const now = new Date()
  const months = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const list = dias.filter((x) => x.date.startsWith(key))
    months.push({ key, month: d.getMonth(), year: d.getFullYear(), minutes: sum(list, (x) => Number(x.minutes) || 0), n: list.length })
  }
  const wd = Array(7).fill(0)
  for (const d of dias) wd[weekday(parseIso(d.date))]++
  const ordenadas = [...dias].sort((a, b) => b.date.localeCompare(a.date))
  return {
    minutes, n: dias.length,
    avg: dias.length ? minutes / dias.length : 0,
    photos: sum(dias, (d) => d.photos?.length || 0),
    noPhoto: dias.filter((d) => !d.photos?.length).length,
    months, wd,
    last: ordenadas[0] || null,
    entities: (db.volunteering || []).map((v) => {
      const ds = dias.filter((d) => d.volunteerId === v.id)
      return { entity: v, n: ds.length, minutes: sum(ds, (d) => Number(d.minutes) || 0) }
    }),
  }
}
