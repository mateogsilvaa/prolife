import React, { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import TaskList from '../components/TaskList.jsx'
import TaskEditor, { newTask } from '../components/TaskEditor.jsx'
import ExamEditor, { kindLabel } from '../components/ExamEditor.jsx'
import DeliverableList from '../components/DeliverableList.jsx'
import { EventForm } from './Calendar.jsx'
import { TrainingForm } from './Training.jsx'
import { useStore, uid, AREAS, refColor, refLabel } from '../lib/store.jsx'
import { useTracker } from '../lib/tracker.jsx'
import { api, enDrive } from '../lib/api.js'
import { today, dur, fmtDate, daysUntil, DAYS, DAYS_LONG, startOfWeek, addDays, MONTHS, iso, parseIso } from '../lib/date.js'
import { expandEvents } from '../lib/recurrence.js'
import {
  weekSummary, weekProgress, classesOn, streak, upcomingExams, pendingDeliverables,
  attendanceBudget, classOccurrences, termWindow, isDeliverable,
} from '../lib/stats.js'
import { activeInjuries, injuryAge, whereLabel, painSummary, loadOf, typeColor } from '../lib/training.js'
import { healthStats, hasHealth, hrs, clockOf, activitiesOn, activityLine, readiness } from '../lib/health.js'
import { FasesBar } from './Health.jsx'

/**
 * Hoy: lo único que hay que mirar al abrir la app.
 *
 * La pregunta que contesta no es «¿cuántas horas llevo?» sino «¿qué tengo
 * hoy y qué se me está escapando?». Por eso arriba va la agenda del día —con
 * la asistencia a un toque, que es lo que hay que apuntar en el momento— y los
 * avisos de lo que necesita atención antes de que sea tarde: una entrega que
 * vence, una asignatura sin margen de faltas, una molestia que va a peor.
 */
export default function Dashboard() {
  const { db } = useStore()
  const [adding, setAdding] = useState(null)
  const [exam, setExam] = useState(null)
  const [event, setEvent] = useState(null)
  const [training, setTraining] = useState(null)

  const now = new Date()
  const hoy = today()
  const manana = iso(addDays(now, 1))
  const hour = now.getHours()
  const hi = hour < 6 ? 'Buenas noches' : hour < 13 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches'

  const agendaHoy = useMemo(() => dayAgenda(db, hoy), [db, hoy])
  const agendaManana = useMemo(() => dayAgenda(db, manana), [db, manana])
  const gcal = useGcalAviso()
  const avisos = useMemo(() => {
    const a = alerts(db)
    return gcal ? [gcal, ...a.filter((x) => x.tone !== 'ok')] : a
  }, [db, gcal])

  const open = db.tasks.filter((t) => t.status !== 'done')
  const tareasHoy = open.filter((t) => t.due && daysUntil(t.due) <= 0)
  const tareasPronto = open.filter((t) => t.due && daysUntil(t.due) > 0 && daysUntil(t.due) <= 7).sort((a, b) => a.due.localeCompare(b.due))
  const entregas = pendingDeliverables(db).filter((e) => daysUntil(e.date) <= 14)

  const entreno = db.training.find((t) => t.date === hoy)
  const clasesHoy = agendaHoy.filter((x) => x.kind === 'class' && !x.cancelled)

  const resumen = [
    clasesHoy.length ? `${clasesHoy.length} ${clasesHoy.length === 1 ? 'clase' : 'clases'}` : 'sin clases',
    tareasHoy.length + entregas.filter((e) => daysUntil(e.date) <= 0).length
      ? `${tareasHoy.length + entregas.filter((e) => daysUntil(e.date) <= 0).length} cosas que vencen`
      : null,
    entreno?.done ? `entreno hecho (${entreno.type.toLowerCase()})` : null,
  ].filter(Boolean).join(' · ')

  const openItem = (it) => {
    if (it.event) setEvent(it.event)
    else if (it.exam) setExam(it.exam)
    else if (it.training) setTraining(it.training)
    else if (it.href) location.hash = it.href
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{DAYS_LONG[(now.getDay() + 6) % 7]} · {now.getDate()} de {MONTHS[now.getMonth()].toLowerCase()}</div>
          <h2>{hi}{db.profile?.name ? `, ${db.profile.name}` : ''}.</h2>
          <p>Hoy: {resumen}.</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn" onClick={() => setEvent(blankEvent(db))}>
            <Icon name="calendar" size={13} /> Evento
          </button>
          <button className="btn" onClick={() => setAdding(newTask())}>
            <Icon name="plus" size={13} /> Tarea <span className="kbd">N</span>
          </button>
        </div>
      </div>

      <div className="hoy-grid">
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h3>Agenda de hoy</h3>
              <a className="btn sm ghost" href="#/calendario">Calendario <Icon name="chevronR" size={12} /></a>
            </div>
            <Agenda items={agendaHoy} date={hoy} onOpen={openItem} empty="Nada en la agenda. Día libre." />
            {agendaManana.length > 0 && (
              <>
                <div className="eyebrow" style={{ margin: '16px 0 4px' }}>Mañana · {DAYS_LONG[(now.getDay()) % 7].toLowerCase()}</div>
                <Agenda items={agendaManana} date={manana} onOpen={openItem} compact />
              </>
            )}
          </div>
          <Cuerpo />
        </div>

        <div className="stack">
          {(tareasHoy.length > 0 || entregas.length > 0 || tareasPronto.length > 0) && (
            <div className="card">
              <div className="card-head">
                <h3>Por hacer</h3>
                <a className="btn sm ghost" href="#/tareas">Todas <Icon name="chevronR" size={12} /></a>
              </div>
              {entregas.length > 0 && <DeliverableList items={entregas} />}
              {tareasHoy.length > 0 && <TaskList tasks={tareasHoy} />}
              {tareasPronto.length > 0 && (
                <>
                  <div className="eyebrow" style={{ margin: '12px 0 2px' }}>Esta semana</div>
                  <TaskList tasks={tareasPronto} />
                </>
              )}
            </div>
          )}

          <Seguir />
          <Semana />
        </div>

        <div className="stack hoy-col-3">
          <div className="card">
            <div className="card-head">
              <h3>Ojo con esto</h3>
              <span className="badge">{avisos.filter((a) => a.tone !== 'ok').length}</span>
            </div>
            <div className="scroll-box" style={{ maxHeight: 'calc(100vh - 420px)' }}>
            {avisos.map((a, i) => (
              <div key={i} className={`alerta ${a.tone}`}>
                <span className="ico"><Icon name={a.icon} size={13} /></span>
                <span className="txt">{a.text}</span>
                {a.href && <a className="btn sm ghost" href={a.href}><Icon name="chevronR" size={12} /></a>}
              </div>
            ))}
            </div>
          </div>
          <EntrenoHoy onOpen={setTraining} />
        </div>
      </div>

      {adding && <TaskEditor task={adding} onClose={() => setAdding(null)} />}
      {exam && <ExamEditor exam={exam} onClose={() => setExam(null)} />}
      {event && <EventForm event={event} onClose={() => setEvent(null)} />}
      {training && <TrainingForm entry={training} onClose={() => setTraining(null)} />}
    </>
  )
}

const blankEvent = (db, date = today()) => ({
  id: uid('ev'), title: '', date, start: '', end: '',
  categoryId: db.categories[0]?.id || null, notes: '', repeat: null, exceptions: [],
})

/* ------------------------------------------------------------------ agenda */

/** Todo lo que pasa un día, en orden: clases, exámenes, eventos, entreno y voluntariado. */
export function dayAgenda(db, date) {
  const out = []
  const cats = new Map(db.categories.map((c) => [c.id, c]))

  for (const { subject: s, slot, slotIndex } of classesOn(db, date)) {
    const status = db.attendance.find((a) => a.subjectId === s.id && a.date === date && a.slot === slotIndex)?.status || null
    out.push({
      kind: 'class', label: s.name, color: s.color, start: slot.start, end: slot.end,
      detail: slot.room ? `Aula ${slot.room}` : 'Clase', subject: s, slotIndex, status,
      cancelled: status === 'cancelled', href: `#/uni/${s.id}`,
    })
  }
  for (const ex of db.exams || []) {
    if (ex.date !== date) continue
    const s = db.subjects.find((x) => x.id === ex.subjectId)
    out.push({
      kind: 'exam', label: `${ex.delivered ? '✓ ' : ''}${ex.title}`, color: s?.color || 'var(--accent)',
      start: ex.start, end: ex.end, important: !ex.delivered,
      detail: `${kindLabel(ex.kind)}${s ? ` · ${s.name}` : ''}${ex.room ? ` · ${ex.room}` : ''}`, exam: ex,
    })
  }
  for (const ev of expandEvents(db.events, date, date)) {
    const c = cats.get(ev.categoryId)
    out.push({ kind: 'event', label: ev.title, color: c?.color || 'var(--ink-2)', start: ev.start, end: ev.end, detail: c?.name || 'Evento', event: ev })
  }
  const tr = db.training.find((t) => t.date === date && t.done)
  if (tr) out.push({ kind: 'training', label: tr.type, color: AREAS.sport.color, detail: `${tr.minutes} min · RPE ${tr.rpe}`, training: tr })
  for (const vd of db.volunteerDays || []) {
    if (vd.date !== date) continue
    const ent = (db.volunteering || []).find((x) => x.id === vd.volunteerId)
    out.push({ kind: 'volunteer', label: ent?.name || 'Voluntariado', color: ent?.color || AREAS.volunteer.color, detail: vd.task || 'Jornada', href: '#/voluntariado' })
  }
  return out.sort((a, b) => (a.start || 'zz').localeCompare(b.start || 'zz'))
}

const toMin = (t) => {
  const [h, m] = String(t || '').split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (m || 0) : null
}

function Agenda({ items, date, onOpen, empty, compact }) {
  const { applyChange } = useStore()
  if (!items.length) return empty ? <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>{empty}</p> : null
  const now = new Date()
  const ahora = date === today() ? now.getHours() * 60 + now.getMinutes() : null

  /** Un toque marca; tocar el que ya está marcado lo quita. */
  const marcar = (it, status) =>
    applyChange({
      kind: 'asistencia', subjectId: it.subject.id, date, slot: it.slotIndex,
      status: it.status === status ? null : status,
    })

  return (
    <div className="agenda">
      {items.map((it, i) => {
        const ini = toMin(it.start)
        const fin = toMin(it.end) ?? (ini !== null ? ini + 60 : null)
        const pasada = ahora !== null && fin !== null && fin < ahora
        const enCurso = ahora !== null && ini !== null && ini <= ahora && fin >= ahora
        return (
          <div key={i} className={`agenda-row${pasada && it.kind !== 'class' ? ' pasada' : ''}${enCurso ? ' ahora' : ''}`}>
            <span className="hora">{it.start || '—'}</span>
            <span className="barra" style={{ background: it.cancelled ? 'var(--line-strong)' : it.color }} />
            <div className="cuerpo" style={{ cursor: 'pointer' }} onClick={() => onOpen(it)}>
              <div style={{ fontSize: 13.5, fontWeight: it.important ? 600 : 500, textDecoration: it.cancelled ? 'line-through' : 'none', opacity: it.cancelled ? 0.55 : 1 }}>
                {it.kind === 'exam' ? '★ ' : ''}{it.label}
                {enCurso && <span className="badge hot" style={{ marginLeft: 6 }}>ahora</span>}
              </div>
              {!compact && (
                <div className="dim" style={{ fontSize: 11.5 }}>
                  {it.cancelled ? 'Cancelada' : it.detail}{it.end ? ` · hasta ${it.end}` : ''}
                </div>
              )}
            </div>
            {it.kind === 'class' && !compact && (
              <span className="att-quick">
                <button className={`present${it.status === 'present' ? ' on' : ''}`} title="Fui" onClick={() => marcar(it, 'present')}>✓</button>
                <button className={`absent${it.status === 'absent' ? ' on' : ''}`} title="Falté" onClick={() => marcar(it, 'absent')}>✕</button>
                <button className={`cancelled${it.status === 'cancelled' ? ' on' : ''}`} title="Clase cancelada: no cuenta" onClick={() => marcar(it, 'cancelled')}>⊘</button>
              </span>
            )}
            {it.kind === 'class' && compact && (
              <span className="att-quick">
                <button
                  className={`cancelled${it.cancelled ? ' on' : ''}`}
                  title={it.cancelled ? 'Al final sí hay clase' : 'Avisaron de que no hay clase: márcala como cancelada'}
                  onClick={() => marcar(it, 'cancelled')}
                >⊘</button>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ avisos */

/**
 * Lo que necesita atención, ordenado por gravedad. Cada aviso dice qué pasa y
 * lleva a donde se arregla. Si no hay nada, se dice: saber que todo está en
 * orden también es información.
 */
function alerts(db) {
  const out = []
  const hoy = today()

  for (const e of pendingDeliverables(db)) {
    const d = daysUntil(e.date)
    if (d < 0) out.push({ tone: 'hot', icon: 'alert', text: <><b>{e.title}</b> ({e.subject?.name}) venció {fmtDate(e.date)} y no está marcada como entregada</>, href: '#/tareas', w: 0 })
    else if (d <= 3) out.push({ tone: 'hot', icon: 'clock', text: <><b>{e.title}</b> se entrega {fmtDate(e.date)}{e.weight ? ` · ${e.weight}% de ${e.subject?.name}` : ''}</>, href: '#/tareas', w: 1 })
  }

  for (const e of upcomingExams(db, 10).filter((x) => !isDeliverable(x))) {
    const d = daysUntil(e.date)
    out.push({ tone: d <= 3 ? 'hot' : 'warn', icon: 'grad', text: <>Examen de <b>{e.subject?.name || e.title}</b> {d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`}{e.weight ? ` · ${e.weight}%` : ''}</>, href: e.subject ? `#/uni/${e.subject.id}` : '#/calendario', w: d <= 3 ? 1 : 3 })
  }

  for (const s of db.subjects) {
    const b = attendanceBudget(db, s.id)
    if (!b.totalCounted) continue
    if (b.doomed) out.push({ tone: 'hot', icon: 'x', text: <><b>{s.name}</b>: ya no llegas al {Math.round(b.minRate * 100)}% de asistencia</>, href: `#/uni/${s.id}`, w: 0 })
    else if (b.left <= 1) out.push({ tone: 'warn', icon: 'alert', text: <><b>{s.name}</b>: {b.left === 0 ? 'no te queda ninguna falta' : 'solo te queda 1 falta'}</>, href: `#/uni/${s.id}`, w: 2 })
  }

  // Clases pasadas sin marcar: si se acumulan, el cálculo de faltas deja de valer.
  const { from } = termWindow(db)
  const ayer = iso(addDays(new Date(), -1))
  let sinMarcar = 0
  for (const s of db.subjects) {
    for (const o of classOccurrences(db, s, from, ayer)) {
      if (!db.attendance.some((a) => a.subjectId === s.id && a.date === o.date && a.slot === o.slotIndex)) sinMarcar++
    }
  }
  if (sinMarcar >= 3) out.push({ tone: 'warn', icon: 'check', text: <>{sinMarcar} clases pasadas sin marcar: las faltas que te quedan no son fiables</>, href: '#/uni', w: 4 })

  const atrasadas = db.tasks.filter((t) => t.status !== 'done' && t.due && t.due < hoy).length
  if (atrasadas) out.push({ tone: 'warn', icon: 'clock', text: <>{atrasadas} {atrasadas === 1 ? 'tarea atrasada' : 'tareas atrasadas'}</>, href: '#/tareas', w: 3 })

  for (const l of activeInjuries(db)) {
    out.push({ tone: 'hot', icon: 'heart', text: <>Lesión en <b>{whereLabel(l).toLowerCase()}</b> {injuryAge(l)}</>, href: '#/atletismo', w: 1 })
  }
  for (const z of painSummary(db, 30).zones.filter((z) => z.n >= 3 && z.trend > 0.5)) {
    out.push({ tone: 'warn', icon: 'alert', text: <>Molestia en <b>{z.where.toLowerCase()}</b> {z.n} veces este mes y va a peor</>, href: '#/atletismo', w: 2 })
  }

  // Salto de carga: esta semana contra la media de las cuatro anteriores.
  const lunes = startOfWeek(new Date())
  const cargaSemana = (k) => {
    const a = iso(addDays(lunes, -7 * k))
    const b = iso(addDays(lunes, -7 * k + 6))
    return db.training.filter((t) => t.date >= a && t.date <= b).reduce((x, t) => x + loadOf(t), 0)
  }
  const previas = [1, 2, 3, 4].map(cargaSemana).filter((x) => x > 0)
  const media = previas.length ? previas.reduce((a, b) => a + b, 0) / previas.length : 0
  if (media && cargaSemana(0) > media * 1.3) {
    out.push({ tone: 'warn', icon: 'activity', text: <>Carga de entreno un {Math.round((cargaSemana(0) / media - 1) * 100)}% por encima de tu media</>, href: '#/atletismo', w: 3 })
  }

  const ultimo = [...db.training].filter((t) => t.done).sort((a, b) => b.date.localeCompare(a.date))[0]
  const sinEntrenar = ultimo ? daysUntil(ultimo.date) * -1 : null
  if (sinEntrenar !== null && sinEntrenar >= 4 && !activeInjuries(db).length) {
    out.push({ tone: 'warn', icon: 'dumbbell', text: <>{sinEntrenar} días sin entrenar</>, href: '#/atletismo', w: 5 })
  }

  const sinFoto = (db.volunteerDays || []).filter((d) => !d.photos?.length && daysUntil(d.date) >= -30).length
  if (sinFoto) out.push({ tone: 'warn', icon: 'image', text: <>{sinFoto} {sinFoto === 1 ? 'jornada' : 'jornadas'} de voluntariado sin foto este mes</>, href: '#/voluntariado', w: 6 })

  // Lo que dice el reloj: noche corta y pulso en reposo por encima de lo normal.
  if (hasHealth(db)) {
    const h = healthStats(db)
    if (h.anoche?.seconds && h.anoche.seconds < 6 * 3600) {
      out.push({ tone: 'warn', icon: 'moon', text: <>Anoche dormiste <b>{hrs(h.anoche.seconds)}</b>: hoy mejor no apretar en el entreno</>, href: '#/salud', w: 2 })
    }
    if (h.restHoy && h.restBase && h.restHoy - h.restBase >= 6) {
      out.push({ tone: 'warn', icon: 'heart', text: <>Pulso en reposo <b>{h.restHoy}</b>, {Math.round(h.restHoy - h.restBase)} por encima de tu base: cansancio o algo que se incuba</>, href: '#/salud', w: 2 })
    }
  }

  if (!out.length) out.push({ tone: 'ok', icon: 'check', text: 'Todo en orden: nada urgente, ninguna asignatura al límite.', w: 9 })
  return out.sort((a, b) => a.w - b.w)
}

/**
 * Google Calendar desconectado o fallando. Va aparte porque no sale del
 * `db.json` sino del ordenador, y arriba del todo: un calendario que dejó de
 * ponerse al día hace dos semanas sin que nadie lo dijera es justo lo que no
 * puede volver a pasar.
 */
function useGcalAviso() {
  const [aviso, setAviso] = useState(null)
  useEffect(() => {
    if (enDrive) return
    let vivo = true
    api.gcalStatus(true)
      .then((st) => {
        if (!vivo || !st?.configurado) return
        const desde = st.ultima?.at ? ` (última vez al día: ${fmtDate(iso(new Date(st.ultima.at)))})` : ''
        if (!st.conectado) {
          setAviso({ tone: 'hot', icon: 'calendar', w: -1, href: '#/ajustes', text: <>Google Calendar está <b>desconectado</b>: el móvil no recibe los cambios{desde}. Vuelve a conectarlo en Ajustes.</> })
        } else if (st.fallo) {
          setAviso({ tone: 'warn', icon: 'calendar', w: -1, href: '#/ajustes', text: <>Google Calendar no se pudo poner al día{desde}: {st.fallo.mensaje}</> })
        }
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [])
  return aviso
}

/* --------------------------------------------------------------- entreno */

/** Lo que dice el reloj de hoy: la noche, los pasos y el pulso en reposo. */
function Cuerpo() {
  const { db } = useStore()
  if (!hasHealth(db)) return null
  const h = healthStats(db)
  const prep = readiness(db)
  const s = h.ultimoSueno
  const pasosPct = h.stepsHoy != null && h.stepGoal ? Math.min(100, (h.stepsHoy / h.stepGoal) * 100) : null
  return (
    <div className="card">
      <div className="card-head"><h3>Tu cuerpo</h3><a className="btn sm ghost" href="#/salud"><Icon name="chevronR" size={12} /></a></div>
      {prep && (
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <span className="num" style={{ fontSize: 24, color: prep.color }}>{prep.score}</span>
          <div style={{ lineHeight: 1.25 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: prep.color }}>{prep.verdict}</div>
            {prep.motivo && <div className="dim" style={{ fontSize: 11 }}>{prep.motivo}</div>}
          </div>
        </div>
      )}
      {s ? (
        <div style={{ marginBottom: 12 }}>
          <div className="row" style={{ gap: 8, alignItems: 'baseline', marginBottom: 6 }}>
            <span className="num" style={{ fontSize: 24 }}>{hrs(s.seconds)}</span>
            <span className="dim" style={{ fontSize: 12 }}>{h.anoche ? 'anoche' : 'último sueño'} · {clockOf(s.start)}–{clockOf(s.end)}{s.score != null ? ` · ${s.score}/100` : ''}</span>
          </div>
          <FasesBar s={s} height={8} />
        </div>
      ) : null}
      <div className="row" style={{ gap: 18 }}>
        <div>
          <div className="num" style={{ fontSize: 20 }}>{h.stepsHoy != null ? h.stepsHoy.toLocaleString('es') : '—'}</div>
          <div className="eyebrow">pasos hoy</div>
        </div>
        <div>
          <div className="num" style={{ fontSize: 20 }}>{h.restHoy ?? '—'}</div>
          <div className="eyebrow">ppm reposo</div>
        </div>
        {h.bbHoy?.high != null && (
          <div>
            <div className="num" style={{ fontSize: 20 }}>{h.bbHoy.high}</div>
            <div className="eyebrow">body battery</div>
          </div>
        )}
      </div>
      {pasosPct !== null && (
        <div className="meter" style={{ marginTop: 10 }}><i style={{ width: `${pasosPct}%`, background: pasosPct >= 100 ? 'var(--green)' : 'var(--ink)' }} /></div>
      )}
      {activitiesOn(db, today()).map((a) => (
        <div key={a.id} className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>⌚ {activityLine(a)}</div>
      ))}
    </div>
  )
}

function EntrenoHoy({ onOpen }) {
  const { db } = useStore()
  const hoy = today()
  const t = db.training.find((x) => x.date === hoy)
  const lunes = startOfWeek(new Date())
  const dias = Array.from({ length: 7 }, (_, i) => iso(addDays(lunes, i)))
  const goal = db.settings.weeklyTrainingGoal || 5
  const hechos = db.training.filter((x) => x.done && x.date >= dias[0] && x.date <= dias[6]).length
  const nuevo = (patch) => ({
    id: uid('tr'), date: hoy, done: true, type: db.settings.trainingTypes?.[0] || 'Rodaje',
    minutes: 60, rpe: 5, cmjPre: '', cmjPost: '', notes: '', pains: [], ...patch,
  })

  return (
    <div className="card">
      <div className="card-head">
        <h3>Entreno</h3>
        <a className="btn sm ghost" href="#/atletismo"><Icon name="chevronR" size={12} /></a>
      </div>
      {t ? (
        <div className="list-row click" onClick={() => onOpen(t)}>
          <span className="dot" style={{ background: t.done ? typeColor(db, t.type) : 'var(--line-strong)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5 }}>{t.done ? t.type : 'Descanso'}</div>
            {t.done && <div className="dim" style={{ fontSize: 11.5 }}>{t.minutes} min · RPE {t.rpe}{(t.pains || []).length ? ` · ⚠ ${t.pains.length} molestia${t.pains.length === 1 ? '' : 's'}` : ''}</div>}
          </div>
          <Icon name="edit" size={12} />
        </div>
      ) : (
        <>
          <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>¿Qué has hecho hoy?</div>
          <div className="row wrap" style={{ gap: 5 }}>
            {(db.settings.trainingTypes || []).map((x) => (
              <button key={x} className="chip" onClick={() => onOpen(nuevo({ type: x }))}>
                <span className="dot" style={{ background: typeColor(db, x) }} />{x}
              </button>
            ))}
            <button className="chip" onClick={() => onOpen(nuevo({ done: false }))}>Descanso</button>
          </div>
        </>
      )}
      <div className="row" style={{ gap: 4, marginTop: 12 }}>
        {dias.map((d, i) => {
          const x = db.training.find((y) => y.date === d)
          return (
            <div key={d} title={x ? (x.done ? x.type : 'descanso') : ''} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                height: 6, borderRadius: 3,
                background: x?.done ? typeColor(db, x.type) : d === hoy ? 'var(--line-strong)' : 'var(--line)',
              }} />
              <div className="dim" style={{ fontSize: 9.5, marginTop: 3 }}>{DAYS[i][0]}</div>
            </div>
          )
        })}
      </div>
      <div className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>{hechos} de {goal} sesiones esta semana</div>
    </div>
  )
}

/* ---------------------------------------------------------------- semana */

function Semana() {
  const { db } = useStore()
  const now = new Date()
  const week = weekSummary(db, startOfWeek(now))
  const progress = weekProgress(db)
  const todaySecs = db.sessions.filter((s) => s.date === today()).reduce((a, s) => a + s.seconds, 0)
  const goal = (db.settings.dailyGoalMin || 300) * 60
  const racha = streak(db)

  return (
    <div className="card">
      <div className="card-head"><h3>Tu semana</h3><a className="btn sm ghost" href="#/estadisticas"><Icon name="chart" size={12} /></a></div>
      <div className="row" style={{ gap: 20, marginBottom: 12 }}>
        <div>
          <div className="num" style={{ fontSize: 26 }}>{dur(todaySecs)}</div>
          <div className="eyebrow">hoy · objetivo {dur(goal)}</div>
        </div>
        <div>
          <div className="num" style={{ fontSize: 26, color: progress.pct >= 100 ? 'var(--green)' : '' }}>{progress.pct}%</div>
          <div className="eyebrow">trabajo semanal</div>
        </div>
        {racha > 1 && (
          <div>
            <div className="num" style={{ fontSize: 26 }}>{racha}</div>
            <div className="eyebrow">días seguidos</div>
          </div>
        )}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        {Object.entries(AREAS).map(([k, v]) => {
          const s = week.byArea[k] || 0
          if (!s) return null
          return (
            <div key={k} className="row" style={{ gap: 8, fontSize: 12 }}>
              <span className="dot" style={{ background: v.color }} />
              <span style={{ width: 84 }}>{v.label}</span>
              <div className="meter" style={{ flex: 1 }}><i style={{ width: `${week.total ? (s / week.total) * 100 : 0}%`, background: v.color }} /></div>
              <span className="mono dim" style={{ width: 44, textAlign: 'right' }}>{dur(s)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------- seguir trabajando */

function Seguir() {
  const { db, toast } = useStore()
  const { start } = useTracker()
  const items = recent(db)
  if (!items.length) return null
  return (
    <div className="card">
      <div className="card-head">
        <h3>Seguir con lo de siempre</h3>
        <span className="dim" style={{ fontSize: 11.5 }}>empieza a contar con un toque</span>
      </div>
      <div className="stack" style={{ gap: 5 }}>
        {items.map((r) => (
          <div key={r.key} className="link-tile" style={{ cursor: 'default' }}>
            <span className="glyph" style={{ background: r.color }}><Icon name="clock" size={11} /></span>
            <a href={r.href} style={{ flex: 1, minWidth: 0, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.label}
            </a>
            <span className="mono dim" style={{ fontSize: 11 }}>{dur(r.seconds)}</span>
            <button
              className="btn sm"
              title="Empezar una sesión de trabajo en esto"
              onClick={() => { start(r.ctx); toast(`Contando tiempo en ${r.label}`) }}
            >
              <Icon name="play" size={10} fill="currentColor" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Las cuatro cosas en las que más has trabajado últimamente. */
function recent(db) {
  const seen = new Map()
  for (const s of [...db.sessions].reverse()) {
    if (!s.refId && !s.taskId) continue
    if (s.area === 'sport' || s.area === 'life' || s.area === 'volunteer') continue
    const key = `${s.area}:${s.refId || '-'}:${s.taskId || '-'}`
    if (seen.has(key)) { seen.get(key).seconds += s.seconds; continue }
    if (seen.size >= 4) continue
    seen.set(key, {
      key,
      href: s.area === 'uni' ? `#/uni/${s.refId}` : s.area === 'work' ? `#/trabajo/${s.refId}` : '#/tareas',
      label: refLabel(db, s),
      seconds: s.seconds,
      color: refColor(db, s),
      ctx: { area: s.area, refId: s.refId || null, taskId: s.taskId || null, label: refLabel(db, s) },
    })
  }
  return [...seen.values()]
}
