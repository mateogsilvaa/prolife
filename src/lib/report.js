import { AREAS } from './store.jsx'
import { DAYS, DAYS_LONG, MONTHS, iso, today, parseIso } from './date.js'
import { attendanceBudget, classOccurrences, termWindow, slotRange, isDeliverable } from './stats.js'
import { repeatLabel } from './recurrence.js'
import { uniStats, timeStats, taskStats, volunteerSummary, gradeOf } from './insights.js'
import { trainingStats, painSummary, loadOf, allPains, whereLabel, kindLabel, injuryDays, PAIN_WHEN } from './training.js'
import { kindLabel as examKind } from '../components/ExamEditor.jsx'

/**
 * El informe completo: todo lo que hay en la base, legible por una persona.
 *
 * Es un único HTML sin nada de fuera —ni fuentes ni scripts—, para que se abra
 * igual dentro de diez años, se pueda imprimir a PDF desde cualquier navegador
 * y no dependa de que prolife siga existiendo. Es largo a propósito: la idea es
 * que no falte nada, no que quepa en una página.
 */

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const h = (n) => (n / 3600).toFixed(1).replace('.', ',')
const hm = (sec) => {
  const s = Math.round(sec || 0)
  const H = Math.floor(s / 3600)
  const M = Math.floor((s % 3600) / 60)
  return H ? `${H} h ${String(M).padStart(2, '0')} min` : `${M} min`
}
const fecha = (d) => {
  if (!d) return '—'
  const x = parseIso(d)
  return `${DAYS[(x.getDay() + 6) % 7]} ${x.getDate()} ${MONTHS[x.getMonth()].slice(0, 3).toLowerCase()} ${x.getFullYear()}`
}
const ts = (ms) => (ms ? new Date(ms).toLocaleString('es') : '—')
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)} %`)
const num = (x, d = 2) => (x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(d).replace('.', ','))
const ATT = { present: 'Asistí', absent: 'Falté', late: 'Tarde', excused: 'Justificada', cancelled: 'Cancelada' }

function table(head, rows, opts = {}) {
  if (!rows.length) return `<p class="vacio">${esc(opts.empty || 'Nada.')}</p>`
  return `<table${opts.small ? ' class="small"' : ''}><thead><tr>${head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c == null ? '—' : c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`
}
const kv = (pairs) =>
  `<dl class="kv">${pairs.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`
const cards = (items) => `<div class="cards">${items.map(([l, v, s]) => `<div class="c"><div class="l">${esc(l)}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`).join('')}</div>`
const bar = (v, max, color = '#333') => `<span class="bar"><i style="width:${max ? Math.round((v / max) * 100) : 0}%;background:${color}"></i></span>`

export function buildReport(db) {
  const now = new Date()
  const u = uniStats(db)
  const t = timeStats(db)
  const k = taskStats(db)
  const tr = trainingStats(db)
  const ps = painSummary(db, 3650)
  const vs = volunteerSummary(db)
  const secciones = []
  const sec = (id, titulo, cuerpo) => secciones.push({ id, titulo, cuerpo })

  /* ---------------------------------------------------------- resumen */
  sec('resumen', 'Resumen', `
    ${cards([
      ['Tiempo registrado', `${h(t.total)} h`, t.first ? `desde ${fecha(t.first)}` : ''],
      ['Asignaturas', db.subjects.length, `${h(u.seconds)} h de estudio`],
      ['Asistencia real', pct(u.attendance), `${u.present} de ${u.marked} clases`],
      ['Nota media provisional', num(u.creditsGrade ?? u.avgGrade), ''],
      ['Tareas', `${k.done} hechas`, `${k.open} abiertas · ${pct(k.onTime)} a tiempo`],
      ['Entrenos', tr.total, `${h(tr.minutes * 60)} h · RPE medio ${num(tr.avgRpe, 1)}`],
      ['Molestias apuntadas', ps.pains.length, `${(db.injuries || []).length} lesiones`],
      ['Voluntariado', `${h(vs.minutes * 60)} h`, `${vs.n} jornadas`],
    ])}
    <h3>Reparto del tiempo por área</h3>
    ${table(['Área', '', 'Horas', '%'], Object.entries(AREAS).map(([a, v]) => [
      `<span class="dot" style="background:${v.color}"></span>${esc(v.label)}`,
      bar(t.byArea[a] || 0, Math.max(...Object.values(t.byArea), 1), v.color),
      h(t.byArea[a] || 0),
      t.total ? `${Math.round(((t.byArea[a] || 0) / t.total) * 100)} %` : '—',
    ]))}
  `)

  /* ------------------------------------------------------ universidad */
  const { from, to } = termWindow(db)
  let uni = `
    ${kv([
      ['Curso', esc(db.profile?.course)],
      ['Inicio / fin del curso', `${fecha(db.settings.termStart)} → ${fecha(db.settings.termEnd)}`],
      ['Asistencia mínima por defecto', pct(db.settings.attendanceMin ?? 0.7)],
      ['Horas de trabajo por semana (objetivo)', esc(db.settings.weeklyGoalHours)],
    ])}
    <h3>Vista general</h3>
    ${table(['Asignatura', 'Horas', 'Asistencia', 'Faltas', 'Margen', 'Canceladas', 'Nota', 'Evaluado', 'Entregas', 'Tareas'], u.rows.map((r) => [
      `<span class="dot" style="background:${esc(r.subject.color)}"></span>${esc(r.subject.name)}`,
      h(r.seconds), pct(r.attendance), r.absent,
      r.budget.totalCounted ? (r.budget.doomed ? '<b class="mal">0 (no llegas)</b>' : r.budget.left) : '—',
      r.cancelled, num(r.grade), r.weightDone ? `${r.weightDone} %` : '—',
      r.deliverables ? `${r.delivered}/${r.deliverables}` : '—', `${r.doneTasks} hechas · ${r.openTasks} abiertas`,
    ]))}
  `
  for (const s of db.subjects) {
    const r = u.rows.find((x) => x.subject.id === s.id)
    const b = attendanceBudget(db, s.id)
    const occ = classOccurrences(db, s, from, to)
    const status = (o) => db.attendance.find((a) => a.subjectId === s.id && a.date === o.date && a.slot === o.slotIndex)?.status
    const g = gradeOf(db, s.id)
    const meses = new Map()
    for (const x of db.sessions.filter((y) => y.refId === s.id)) meses.set(x.date.slice(0, 7), (meses.get(x.date.slice(0, 7)) || 0) + x.seconds)
    uni += `
      <article class="ficha">
        <h3><span class="dot" style="background:${esc(s.color)}"></span>${esc(s.name)}</h3>
        ${kv([
          ['Código', esc(s.code)], ['Profesor/a', esc(s.professor)], ['Créditos', esc(s.credits)],
          ['Horas objetivo por semana', esc(s.weeklyGoalHours || '')], ['Asistencia mínima', s.attendanceMin != null ? pct(s.attendanceMin) : 'la general'],
          ['Carpeta', `<code>${esc(s.folder)}</code>`], ['Campus', s.portalUrl ? `<a href="${esc(s.portalUrl)}">${esc(s.portalUrl)}</a>` : ''],
          ['Tiempo dedicado', `${hm(r?.seconds)}`],
        ])}
        <h4>Horario</h4>
        ${table(['Día', 'Hora', 'Aula', 'Válido'], (s.schedule || []).map((sl) => {
          const rg = slotRange(sl, db)
          return [DAYS_LONG[sl.day], `${esc(sl.start)}–${esc(sl.end)}`, esc(sl.room), `${fecha(rg.from)} → ${fecha(rg.until)}`]
        }), { empty: 'Sin horario.' })}
        <h4>Asistencia</h4>
        ${kv([
          ['Clases en el curso', b.total], ['Cuentan', b.totalCounted], ['Asistidas', b.attended], ['Faltas', b.absences],
          ['Justificadas', b.excused], ['Canceladas', b.cancelled], ['Sin marcar', b.unmarked],
          ['Faltas permitidas', b.maxAbsences], ['Te quedan', b.doomed ? '<b class="mal">ninguna: ya no llegas</b>' : b.left],
        ])}
        ${table(['Fecha', 'Hora', 'Estado'], occ.filter((o) => o.date <= today() || status(o)).map((o) => [
          fecha(o.date), esc(o.slot.start), status(o) ? `<span class="st ${status(o)}">${ATT[status(o)]}</span>` : '<span class="vacio">sin marcar</span>',
        ]), { small: true, empty: 'Sin clases todavía.' })}
        <h4>Evaluación</h4>
        ${kv([['Nota provisional', num(g.grade)], ['Peso ya evaluado', `${g.weightDone} % de ${g.weightTotal || 100} %`]])}
        ${table(['Fecha', 'Tipo', 'Nombre', 'Peso', 'Nota', 'Entregada', 'Notas'], g.exams.sort((a, b2) => a.date.localeCompare(b2.date)).map((e) => [
          fecha(e.date) + (e.start ? ` ${esc(e.start)}` : ''), esc(examKind(e.kind)), esc(e.title), e.weight ? `${e.weight} %` : '—',
          e.grade ?? '—', isDeliverable(e) ? (e.delivered ? `sí${e.deliveredAt ? ` (${ts(e.deliveredAt)})` : ''}` : 'no') : '',
          esc(e.notes),
        ]), { empty: 'Sin exámenes ni entregas.' })}
        <h4>Tareas</h4>
        ${table(['Tarea', 'Fecha límite', 'Estado', 'Notas'], db.tasks.filter((x) => x.refId === s.id).map((x) => [
          esc(x.title), fecha(x.due), x.status === 'done' ? `hecha ${ts(x.doneAt)}` : 'abierta', esc(x.notes),
        ]), { empty: 'Sin tareas.' })}
        <h4>Horas por mes</h4>
        ${table(['Mes', 'Horas'], [...meses.entries()].sort().map(([m, sec2]) => [m, h(sec2)]), { empty: 'Sin tiempo.' })}
      </article>`
  }
  sec('universidad', 'Universidad', uni)

  /* ------------------------------------------------------- calendario */
  const cats = new Map(db.categories.map((c) => [c.id, c]))
  sec('calendario', 'Calendario', `
    <h3>Cuatrimestres</h3>
    ${table(['Nombre', 'Desde', 'Hasta'], (db.terms || []).map((x) => [esc(x.name), fecha(x.from), fecha(x.to)]), { empty: 'Sin cuatrimestres definidos.' })}
    <h3>Festivos y vacaciones</h3>
    ${table(['Nombre', 'Desde', 'Hasta'], [...(db.holidays || [])].sort((a, b) => a.from.localeCompare(b.from)).map((x) => [esc(x.name), fecha(x.from), fecha(x.to || x.from)]), { empty: 'Ninguno.' })}
    <h3>Eventos</h3>
    ${table(['Fecha', 'Hora', 'Evento', 'Categoría', 'Se repite', 'Notas'], [...db.events].sort((a, b) => a.date.localeCompare(b.date)).map((e) => [
      fecha(e.date), e.start ? `${esc(e.start)}${e.end ? `–${esc(e.end)}` : ''}` : 'todo el día', esc(e.title),
      esc(cats.get(e.categoryId)?.name), esc(repeatLabel(e.repeat) || ''), esc(e.notes),
    ]), { empty: 'Ningún evento.' })}
    <h3>Categorías</h3>
    <p>${db.categories.map((c) => `<span class="tag"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</span>`).join(' ')}</p>
  `)

  /* ----------------------------------------------------------- tareas */
  const refName = (x) =>
    (x.area === 'uni' ? db.subjects : x.area === 'work' ? db.projects : x.area === 'volunteer' ? db.volunteering || [] : []).find((y) => y.id === x.refId)?.name || ''
  const spent = (id) => db.sessions.filter((s) => s.taskId === id).reduce((a, s) => a + s.seconds, 0)
  sec('tareas', 'Tareas', `
    ${cards([
      ['Completadas', k.done, `${k.late} tarde`], ['Abiertas', k.open, `${k.overdue} atrasadas`],
      ['A tiempo', pct(k.onTime), k.late ? `retraso medio ${num(k.avgDelay, 1)} días` : ''],
      ['Entregas evaluables', `${k.delivered}/${k.deliverables}`, `${k.pendingDeliverables} por entregar`],
    ])}
    ${table(['Tarea', 'Área', 'De', 'Prioridad', 'Fecha límite', 'Creada', 'Estado', 'Tiempo', 'Notas'],
      [...db.tasks].sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.due || 'z').localeCompare(b.due || 'z')).map((x) => [
        esc(x.title), esc(AREAS[x.area]?.label), esc(refName(x)), x.priority ?? '', fecha(x.due), ts(x.createdAt),
        x.status === 'done' ? `hecha ${ts(x.doneAt)}` : 'abierta', spent(x.id) ? hm(spent(x.id)) : '', esc(x.notes),
      ]), { empty: 'Ninguna tarea.' })}
  `)

  /* ----------------------------------------------------------- tiempo */
  const byDay = new Map()
  for (const s of db.sessions) {
    const d = byDay.get(s.date) || { total: 0, ...Object.fromEntries(Object.keys(AREAS).map((a) => [a, 0])) }
    d.total += s.seconds
    d[s.area] = (d[s.area] || 0) + s.seconds
    byDay.set(s.date, d)
  }
  const byRef = new Map()
  for (const s of db.sessions) {
    const key = `${s.area}:${s.refId || ''}`
    // Sin asignatura ni proyecto detrás (un entreno, algo personal) se agrupa por área.
    const name = refName(s) || AREAS[s.area]?.label || 'Otros'
    const x = byRef.get(key) || { name, area: s.area, seconds: 0 }
    x.seconds += s.seconds
    byRef.set(key, x)
  }
  sec('tiempo', 'Tiempo', `
    ${cards([
      ['Total', `${h(t.total)} h`, ''], ['Días con algo', t.activeDays, `${hm(t.avgActiveDay)} de media`],
      ['Mejor día', t.bestDay ? hm(t.bestDay[1]) : '—', t.bestDay ? fecha(t.bestDay[0]) : ''],
      ['Racha más larga', `${t.bestStreak} días`, t.peakHour != null ? `hora punta: ${t.peakHour}:00` : ''],
    ])}
    <h3>Por asignatura, proyecto o actividad</h3>
    ${table(['Qué', 'Área', '', 'Horas'], [...byRef.values()].sort((a, b) => b.seconds - a.seconds).map((x) => [
      esc(x.name), esc(AREAS[x.area]?.label), bar(x.seconds, Math.max(...[...byRef.values()].map((y) => y.seconds), 1), AREAS[x.area]?.color), h(x.seconds),
    ]))}
    <h3>Por día de la semana (media de los días con algo)</h3>
    ${table(['Día', '', 'Media'], t.wdAvg.map((v, i) => [DAYS_LONG[i], bar(v, Math.max(...t.wdAvg, 1)), hm(v)]))}
    <h3>Mes a mes</h3>
    ${table(['Mes', ...Object.values(AREAS).map((a) => a.label), 'Total'], t.months.map((m) => [
      `${MONTHS[m.month]} ${m.year}`, ...Object.keys(AREAS).map((a) => h(m.byArea[a] || 0)), `<b>${h(m.seconds)}</b>`,
    ]))}
    <h3>Día a día</h3>
    ${table(['Fecha', ...Object.values(AREAS).map((a) => a.label), 'Total'], [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([d, x]) => [
      fecha(d), ...Object.keys(AREAS).map((a) => (x[a] ? hm(x[a]) : '')), `<b>${hm(x.total)}</b>`,
    ]), { small: true })}
  `)

  /* -------------------------------------------------------- atletismo */
  sec('atletismo', 'Atletismo', `
    ${cards([
      ['Entrenos', tr.total, `${tr.thisYear} este año · ${tr.thisMonth} este mes`],
      ['Horas', h(tr.minutes * 60), `${Math.round(tr.avgMin)} min de media`],
      ['RPE medio', num(tr.avgRpe, 1), `carga total ${tr.load}`],
      ['Semanas cumpliendo seguidas', tr.currentStreak, `mejor racha ${tr.bestStreak} · objetivo ${db.settings.weeklyTrainingGoal || 5}/sem`],
      ['Día que más vas', tr.favDay != null ? DAYS_LONG[tr.favDay] : '—', ''],
      ['Adherencia (12 semanas)', pct(tr.adherence), ''],
    ])}
    <h3>Por tipo</h3>
    ${table(['Tipo', 'Sesiones', '%', 'Horas', 'Duración media', 'RPE medio', 'Carga', 'Último', ...DAYS], tr.byType.map((x) => [
      esc(x.type), x.n, `${Math.round((x.n / Math.max(1, tr.total)) * 100)} %`, h(x.minutes * 60), `${Math.round(x.avgMin)} min`,
      num(x.avgRpe, 1), x.load, fecha(x.last), ...x.byWeekday,
    ]))}
    <h3>Por día de la semana</h3>
    ${table(['Día', '', 'Sesiones', 'Horas'], tr.byWeekday.map((n, i) => [DAYS_LONG[i], bar(n, Math.max(...tr.byWeekday, 1), '#4f6b4a'), n, h(tr.minByWeekday[i] * 60)]))}
    <h3>Mes a mes</h3>
    ${table(['Mes', 'Sesiones', 'Horas', 'Carga'], tr.months.map((m) => [`${MONTHS[m.month]} ${m.year}`, m.n, h(m.minutes * 60), m.load]))}
    <h3>Lesiones</h3>
    ${table(['Zona', 'Diagnóstico', 'Desde', 'Alta', 'Días', 'Dolor inicial', 'Notas'], [...(db.injuries || [])].sort((a, b) => b.from.localeCompare(a.from)).map((l) => [
      esc(whereLabel(l)), esc(l.diagnosis), fecha(l.from), l.to ? fecha(l.to) : '<b class="mal">abierta</b>', injuryDays(l), l.level ? `${l.level}/10` : '', esc(l.notes),
    ]), { empty: 'Ninguna lesión registrada.' })}
    <h3>Molestias por zona</h3>
    ${table(['Zona', 'Veces', 'Media', 'Máximo', 'Como lesión', 'Primera', 'Última'], ps.zones.map((z) => [
      esc(z.where), z.n, num(z.avg, 1), z.max, z.lesion, fecha(z.first), fecha(z.last),
    ]), { empty: 'Ninguna molestia apuntada.' })}
    <h3>Todas las molestias</h3>
    ${table(['Fecha', 'Entreno', 'Zona', 'Qué', 'Dolor', 'Cuándo', 'Paré', 'Cómo es'], allPains(db).map((p) => [
      fecha(p.date), esc(p.type), esc(whereLabel(p)), esc(kindLabel(p.kind)), `${p.level}/10`,
      esc(PAIN_WHEN.find((w) => w.id === p.when)?.label), p.stopped ? 'sí' : '', esc(p.notes),
    ]), { empty: 'Ninguna.' })}
    <h3>Todos los entrenos</h3>
    ${table(['Fecha', 'Tipo', 'Min', 'RPE', 'Carga', 'CMJ pre', 'CMJ post', 'Molestias', 'Notas'],
      [...db.training].sort((a, b) => b.date.localeCompare(a.date)).map((x) => [
        fecha(x.date), x.done ? esc(x.type) : '<i>descanso</i>', x.done ? x.minutes : '', x.done ? x.rpe : '', x.done ? loadOf(x) : '',
        esc(x.cmjPre), esc(x.cmjPost), (x.pains || []).map((p) => `${esc(whereLabel(p))} ${p.level}/10`).join('<br>'), esc(x.notes),
      ]), { small: true, empty: 'Ningún entreno.' })}
  `)

  /* ----------------------------------------------------- voluntariado */
  let vol = cards([
    ['Horas', h(vs.minutes * 60), `${vs.n} jornadas`], ['Por jornada', `${h(vs.avg * 60)} h`, ''],
    ['Fotos', vs.photos, vs.noPhoto ? `${vs.noPhoto} jornadas sin foto` : 'todas acreditadas'],
  ])
  for (const v of db.volunteering || []) {
    const dias = (db.volunteerDays || []).filter((d) => d.volunteerId === v.id).sort((a, b) => b.date.localeCompare(a.date))
    const min = dias.reduce((a, d) => a + (Number(d.minutes) || 0), 0)
    vol += `
      <article class="ficha">
        <h3><span class="dot" style="background:${esc(v.color)}"></span>${esc(v.name)}</h3>
        ${kv([['Programa', esc(v.org)], ['Horas', `${h(min * 60)} h${v.hoursGoal ? ` de ${v.hoursGoal} comprometidas` : ''}`], ['Carpeta de fotos', `<code>${esc(v.folder)}</code>`], ['Notas', esc(v.notes)]])}
        ${table(['Fecha', 'Horas', 'Qué hice', 'Notas', 'Fotos'], dias.map((d) => [
          fecha(d.date), h((Number(d.minutes) || 0) * 60), esc(d.task), esc(d.notes),
          d.photos?.length ? d.photos.map((p) => `<code>${esc(p)}</code>`).join('<br>') : '<b class="mal">sin foto</b>',
        ]), { empty: 'Sin jornadas.' })}
      </article>`
  }
  sec('voluntariado', 'Voluntariado', vol)

  /* ---------------------------------------------------------- trabajo */
  let work = ''
  for (const p of db.projects) {
    const sess = db.sessions.filter((s) => s.area === 'work' && s.refId === p.id)
    work += `
      <article class="ficha">
        <h3><span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}</h3>
        ${kv([['Organización', esc(p.org)], ['Estado', esc(p.status)], ['Carpeta', `<code>${esc(p.folder)}</code>`], ['Tiempo', hm(sess.reduce((a, s) => a + s.seconds, 0))], ['Notas', esc(p.notes)]])}
        ${table(['Tarea', 'Fecha límite', 'Estado'], db.tasks.filter((x) => x.refId === p.id).map((x) => [esc(x.title), fecha(x.due), x.status === 'done' ? 'hecha' : 'abierta']), { empty: 'Sin tareas.' })}
      </article>`
  }
  sec('trabajo', 'Trabajo', work || '<p class="vacio">Sin proyectos.</p>')

  /* ----------------------------------------------------------- ajustes */
  const s = db.settings
  sec('ajustes', 'Ajustes', `
    ${kv([
      ['Nombre', esc(db.profile?.name)], ['Curso', esc(db.profile?.course)], ['Organización', esc(s.orgName)],
      ['Objetivo diario', `${s.dailyGoalMin} min`], ['Horas por semana', s.weeklyGoalHours],
      ['Entrenos por semana', s.weeklyTrainingGoal], ['Tipos de entreno', esc((s.trainingTypes || []).join(', '))],
      ['Portal', s.portalUrl ? `<a href="${esc(s.portalUrl)}">${esc(s.portalName || s.portalUrl)}</a>` : ''],
      ['Enlaces', (s.links || []).map((l) => `<a href="${esc(l.url)}">${esc(l.name)}</a>`).join(' · ')],
    ])}
  `)

  /* --------------------------------------------------------- apéndice */
  const refOf = (x) => refName(x) || x.label || AREAS[x.area]?.label || ''
  sec('apendice', 'Apéndice: cada tramo de tiempo', table(['Fecha', 'Inicio', 'Fin', 'Duración', 'Área', 'Qué', 'Origen'],
    [...db.sessions].sort((a, b) => (b.start || 0) - (a.start || 0)).map((x) => [
      fecha(x.date), x.source === 'manual' ? '' : (x.start ? new Date(x.start).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : ''),
      x.source === 'manual' ? '' : (x.end ? new Date(x.end).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : ''),
      hm(x.seconds), esc(AREAS[x.area]?.label), esc(refOf(x)), esc({ manual: 'a mano', focus: 'cronómetro', auto: 'automático' }[x.source] || x.source),
    ]), { small: true, empty: 'Sin tramos.' }))

  const nombre = db.profile?.name ? ` de ${db.profile.name}` : ''
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>prolife — informe${esc(nombre)} · ${iso(now)}</title>
<style>
  :root { --ink:#1d1b17; --ink2:#5a554b; --line:#e3ddd1; --paper:#faf8f3; --accent:#bf3f24; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 14px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1100px; margin: 0 auto; padding: 40px 24px 80px; }
  h1 { font: 400 44px/1.1 Georgia, serif; margin: 0 0 6px; letter-spacing: -0.02em; }
  h2 { font: 400 30px/1.2 Georgia, serif; margin: 56px 0 16px; padding-top: 18px; border-top: 2px solid var(--ink); }
  h3 { font: 600 16px/1.3 system-ui, sans-serif; margin: 26px 0 10px; }
  h4 { font: 600 12px/1.3 system-ui, sans-serif; text-transform: uppercase; letter-spacing: .1em; color: var(--ink2); margin: 18px 0 8px; }
  .sub { color: var(--ink2); margin: 0 0 24px; }
  nav ol { columns: 2; padding-left: 20px; } nav a { color: var(--ink); }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 14px; background: #fff; font-size: 12.5px; }
  table.small { font-size: 11.5px; }
  th { text-align: left; font-weight: 600; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink2); background: #f1ede4; }
  th, td { padding: 5px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; margin: 10px 0 18px; }
  .c { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
  .c .l { font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink2); }
  .c .v { font: 400 28px/1.15 Georgia, serif; margin-top: 4px; }
  .c .s { font-size: 12px; color: var(--ink2); }
  .kv { display: grid; grid-template-columns: max-content 1fr; gap: 3px 16px; margin: 6px 0 12px; }
  .kv dt { color: var(--ink2); } .kv dd { margin: 0; }
  .ficha { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 4px 18px 10px; margin: 18px 0; }
  .ficha table { background: transparent; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; vertical-align: 0; }
  .tag { display: inline-block; border: 1px solid var(--line); border-radius: 99px; padding: 2px 10px; margin: 2px; background: #fff; }
  .bar { display: inline-block; width: 140px; height: 7px; background: #eee8dc; border-radius: 4px; overflow: hidden; vertical-align: middle; }
  .bar i { display: block; height: 100%; }
  .vacio { color: #9a9385; font-style: italic; }
  .mal { color: var(--accent); }
  .st.present { color: #3f7a3a; } .st.absent { color: var(--accent); font-weight: 600; } .st.late { color: #a5711b; }
  .st.excused { color: #3c5a78; } .st.cancelled { color: #9a9385; text-decoration: line-through; }
  code { font: 11.5px ui-monospace, Consolas, monospace; word-break: break-all; }
  footer { margin-top: 60px; color: var(--ink2); font-size: 12px; }
  @media print {
    body { background: #fff; font-size: 11px; } main { padding: 0; max-width: none; }
    h2 { break-before: page; } .ficha { break-inside: avoid-page; } nav { break-after: page; }
    table { font-size: 10px; } a { color: inherit; text-decoration: none; }
  }
</style></head>
<body><main>
  <h1>Informe${esc(nombre)}</h1>
  <p class="sub">Todo lo registrado en prolife hasta el ${esc(now.toLocaleString('es', { dateStyle: 'full', timeStyle: 'short' }))}.
  Para guardarlo como PDF: imprimir → «Guardar como PDF».</p>
  <nav><h3>Índice</h3><ol>${secciones.map((x) => `<li><a href="#${x.id}">${esc(x.titulo)}</a></li>`).join('')}</ol></nav>
  ${secciones.map((x) => `<section id="${x.id}"><h2>${esc(x.titulo)}</h2>${x.cuerpo}</section>`).join('\n')}
  <footer>Generado por prolife · ${db.subjects.length} asignaturas · ${db.tasks.length} tareas · ${db.training.length} entrenos ·
  ${db.sessions.length} tramos de tiempo · ${(db.volunteerDays || []).length} jornadas · ${db.events.length} eventos.</footer>
</main></body></html>`
}

export const reportName = () => {
  const d = new Date()
  return `prolife-informe-${iso(d)}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.html`
}
