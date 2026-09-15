import React, { useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import TaskList from '../components/TaskList.jsx'
import TaskEditor, { newTask } from '../components/TaskEditor.jsx'
import ExamEditor, { newExam, kindLabel } from '../components/ExamEditor.jsx'
import { useStore, uid, AREAS, PALETTE } from '../lib/store.jsx'
import { slotActiveOn, holidayOn, classesBetween } from '../lib/stats.js'
import { expandEvents, FREQ, repeatLabel } from '../lib/recurrence.js'
import { startDrag } from '../lib/drag.js'
import {
  monthMatrix, MONTHS, DAYS, DAYS_LONG, today, iso, parseIso, weekday,
  dur, addDays, startOfWeek, weekLabel,
} from '../lib/date.js'

/** Qué mueven las flechas en cada vista, para poder decirlo en el título. */
const MODO_ANTERIOR = { mes: 'Mes', semana: 'Semana', dia: 'Día' }

const HOUR_H = 46
const DAY_START = 7
const DAY_END = 23
/** A qué se redondea un evento al arrastrarlo: ni al minuto, ni a la hora entera. */
const SNAP_MIN = 5
/** Qué vista de horario se vio la última vez, para no volver siempre al día. */
const MODE_KEY = 'prolife.cal.mode'

const toMin = (t) => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`

/**
 * Reparte en columnas los eventos que coinciden en el tiempo, como cualquier
 * calendario decente: si dos chocan, uno al lado del otro, no uno tapando al
 * otro sin que se note que hay dos. Agrupa por «racimos» que se solapan
 * transitivamente y, dentro de cada uno, reparte columnas con la asignación
 * voraz de siempre (la primera libre); el ancho del racimo entero es el mayor
 * número de columnas que ha hecho falta en algún punto.
 */
function layoutOverlaps(items) {
  const withTimes = items
    .map((it) => {
      const s = toMin(it.start)
      const e = Math.max(s + 15, toMin(it.end) || s + 60)
      return { it, s, e }
    })
    .sort((a, b) => a.s - b.s || a.e - b.e)

  const out = []
  let cluster = []
  let clusterEnd = -Infinity

  const flush = () => {
    if (!cluster.length) return
    const active = []
    let maxCol = 0
    for (const x of cluster) {
      for (let i = active.length - 1; i >= 0; i--) if (active[i].e <= x.s) active.splice(i, 1)
      const used = new Set(active.map((a) => a.col))
      let col = 0
      while (used.has(col)) col++
      active.push({ e: x.e, col })
      maxCol = Math.max(maxCol, col)
      x.col = col
    }
    for (const x of cluster) out.push({ ...x.it, _col: x.col, _cols: maxCol + 1, _s: x.s, _e: x.e })
    cluster = []
  }

  for (const x of withTimes) {
    if (x.s >= clusterEnd) { flush(); clusterEnd = x.e }
    else clusterEnd = Math.max(clusterEnd, x.e)
    cluster.push(x)
  }
  flush()
  return out
}

/** Lee la última vista, o «mes» la primera vez que se abre la app. */
const readMode = () => {
  try {
    const v = localStorage.getItem(MODE_KEY)
    return v === 'semana' || v === 'dia' ? v : 'mes'
  } catch {
    return 'mes'
  }
}

export default function Calendar() {
  const { db, update } = useStore()
  const [mode, setModeRaw] = useState(readMode)
  const setMode = (m) => {
    setModeRaw(m)
    try { localStorage.setItem(MODE_KEY, m) } catch { /* sin storage, no pasa nada */ }
  }
  const [anchor, setAnchor] = useState(() => today())
  const [sel, setSel] = useState(() => today())
  const [event, setEvent] = useState(null)
  const [task, setTask] = useState(null)
  const [exam, setExam] = useState(null)

  const anchorDate = parseIso(anchor)

  /** Todo lo que ocurre en un día: clases, exámenes, entregas, eventos y entrenos. */
  const itemsOf = useMemo(() => {
    const cats = new Map(db.categories.map((c) => [c.id, c]))
    const subjectsById = new Map(db.subjects.map((s) => [s.id, s]))
    return (date) => {
      const wd = weekday(parseIso(date))
      const out = []

      for (const s of db.subjects)
        (s.schedule || []).forEach((sl, slotIndex) => {
          // El horario ya no es eterno: cada clase vale entre sus dos fechas.
          if (sl.day !== wd || !slotActiveOn(sl, date, db)) return
          out.push({
            kind: 'class', label: s.name, color: s.color, start: sl.start, end: sl.end,
            detail: sl.room ? `Aula ${sl.room}` : 'Clase', href: `#/uni/${s.id}`, slotIndex, subject: s,
          })
        })

      for (const ex of db.exams || []) {
        if (ex.date !== date) continue
        const s = subjectsById.get(ex.subjectId)
        out.push({
          kind: 'exam', label: ex.title, color: s?.color || 'var(--accent)',
          start: ex.start, end: ex.end,
          detail: `${kindLabel(ex.kind)}${s ? ` · ${s.name}` : ''}${ex.room ? ` · ${ex.room}` : ''}`,
          exam: ex, important: true,
        })
      }

      for (const ev of expandEvents(db.events, date, date)) {
        const c = cats.get(ev.categoryId)
        out.push({
          kind: 'event', label: ev.title, color: c?.color || 'var(--ink-2)',
          start: ev.start, end: ev.end, detail: c?.name || 'Evento', event: ev,
        })
      }

      for (const t of db.tasks)
        if (t.due === date && t.status !== 'done')
          out.push({ kind: 'task', label: t.title, color: AREAS[t.area]?.color, detail: 'Entrega', task: t })

      for (const tr of db.training)
        if (tr.date === date && tr.done)
          out.push({ kind: 'training', label: tr.type || 'Entreno', color: AREAS.sport.color, detail: `RPE ${tr.rpe || '—'}`, href: '#/atletismo' })

      for (const vd of db.volunteerDays || []) {
        if (vd.date !== date) continue
        const ent = (db.volunteering || []).find((x) => x.id === vd.volunteerId)
        out.push({
          kind: 'volunteer', label: ent?.name || 'Voluntariado', color: ent?.color || AREAS.volunteer.color,
          detail: `${((Number(vd.minutes) || 0) / 60).toFixed(1)} h${vd.task ? ` · ${vd.task}` : ''}`,
          href: ent ? `#/voluntariado/${ent.id}` : '#/voluntariado',
        })
      }

      return out.sort((a, b) => (a.start || 'zz').localeCompare(b.start || 'zz'))
    }
  }, [db])

  const load = (date) => db.sessions.filter((s) => s.date === date).reduce((a, s) => a + s.seconds, 0)

  const shift = (n) => {
    if (mode === 'mes') setAnchor(iso(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + n, 1)))
    else if (mode === 'semana') setAnchor(iso(addDays(anchorDate, n * 7)))
    else { const d = iso(addDays(anchorDate, n)); setAnchor(d); setSel(d) }
  }

  const title =
    mode === 'mes' ? `${MONTHS[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`
    : mode === 'semana' ? weekLabel(startOfWeek(anchorDate))
    : parseIso(anchor).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })

  /** Cada cosa del calendario se abre donde toca. */
  const openItem = (it) => {
    if (!it) return
    if (it.event) setEvent(it.event)
    else if (it.exam) setExam(it.exam)
    else if (it.task) setTask(it.task)
    else if (it.href) location.hash = it.href
  }

  const newEvent = (date, start) => setEvent({
    id: uid('ev'), title: '', date: date || sel, start: start || '', end: '',
    categoryId: db.categories[0]?.id || null, notes: '', repeat: null, exceptions: [],
  })

  /**
   * Mover un evento a mano, arrastrándolo por la rejilla. Solo los que no se
   * repiten: uno de una serie no tiene sitio propio donde guardar «esta vez
   * se movió», así que arrastrarlo tendría que mover la serie entera o crear
   * una excepción con su propio evento — más de lo que pide esto por ahora.
   */
  const rescheduleEvent = (ev, patch) => {
    update((d) => {
      const x = d.events.find((e) => e.id === ev.id)
      if (x) Object.assign(x, patch)
    })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Calendario</div>
          <h2 style={{ textTransform: 'capitalize' }}>{title}</h2>
        </div>
        <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
          <div className="seg">
            {['mes', 'semana', 'dia'].map((m) => (
              <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                {m === 'dia' ? 'Día' : m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <button className="btn ghost icon" title={`${MODO_ANTERIOR[mode]} anterior`} onClick={() => shift(-1)}>
            <Icon name="chevronL" size={15} />
          </button>
          <button className="btn sm" onClick={() => { setAnchor(today()); setSel(today()) }}>Hoy</button>
          <button className="btn ghost icon" title={`${MODO_ANTERIOR[mode]} siguiente`} onClick={() => shift(1)}>
            <Icon name="chevronR" size={15} />
          </button>
          <button className="btn" onClick={() => setExam(newExam({ date: sel }))}><Icon name="plus" size={13} /> Examen</button>
          <button className="btn primary" onClick={() => newEvent()}><Icon name="plus" size={13} /> Evento</button>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
        {db.categories.map((c) => (
          <span key={c.id} className="chip"><span className="dot" style={{ background: c.color }} />{c.name}</span>
        ))}
        <button className="btn sm ghost" onClick={() => (location.hash = '#/ajustes')} title="Gestionar categorías">
          <Icon name="plus" size={11} />
        </button>
      </div>

      {mode === 'mes' && (
        <div className="split with-aside">
          <MonthGrid anchor={anchorDate} sel={sel} setSel={setSel} itemsOf={itemsOf} load={load} onOpen={openItem} />
          <DayPanel
            date={sel}
            itemsOf={itemsOf}
            load={load}
            onOpen={openItem}
            onNew={() => newEvent(sel)}
            onNewTask={() => setTask(newTask({ due: sel }))}
            onNewExam={() => setExam(newExam({ date: sel }))}
          />
        </div>
      )}

      {mode === 'semana' && (
        <TimeGrid
          days={Array.from({ length: 7 }, (_, i) => iso(addDays(startOfWeek(anchorDate), i)))}
          itemsOf={itemsOf}
          onSlot={(date, start) => newEvent(date, start)}
          onOpen={openItem}
          onSelect={(d) => { setSel(d); setAnchor(d) }}
          onDragEvent={rescheduleEvent}
        />
      )}

      {mode === 'dia' && (
        <div className="split with-aside">
          <TimeGrid
            days={[anchor]} itemsOf={itemsOf} onSlot={(date, start) => newEvent(date, start)}
            onOpen={openItem} onSelect={() => {}} onDragEvent={rescheduleEvent}
          />
          <DayPanel
            date={anchor}
            itemsOf={itemsOf}
            load={load}
            onOpen={openItem}
            onNew={() => newEvent(anchor)}
            onNewTask={() => setTask(newTask({ due: anchor }))}
            onNewExam={() => setExam(newExam({ date: anchor }))}
          />
        </div>
      )}

      {event && <EventForm event={event} onClose={() => setEvent(null)} />}
      {task && <TaskEditor task={task} onClose={() => setTask(null)} />}
      {exam && <ExamEditor exam={exam} onClose={() => setExam(null)} />}
    </>
  )
}

/* --------------------------------------------------------------------- mes */

function MonthGrid({ anchor, sel, setSel, itemsOf, load, onOpen }) {
  const { db } = useStore()
  const cells = useMemo(() => monthMatrix(anchor.getFullYear(), anchor.getMonth()), [anchor])
  const maxLoad = Math.max(...cells.map((c) => load(c.date)), 1)

  return (
    <div className="cal">
      <div className="cal-head">{DAYS.map((d) => <div key={d}>{d}</div>)}</div>
      <div className="cal-grid">
        {cells.map((c) => {
          const its = itemsOf(c.date)
          const l = load(c.date)
          const festivo = holidayOn(db, c.date)
          return (
            <div
              key={c.date}
              className={`cal-cell${c.out ? ' out' : ''}${c.date === today() ? ' today' : ''}${c.date === sel ? ' sel' : ''}${festivo ? ' festivo' : ''}`}
              onClick={() => setSel(c.date)}
              title={festivo ? festivo.name || 'Festivo' : undefined}
            >
              <div className="cal-day">{c.day}</div>
              {/* Un festivo se ve de un vistazo en el mes, sin tener que entrar
                  en el día: si no, no hay forma de saber por qué esa semana
                  tiene la mitad de clases. */}
              {festivo && (
                <div className="cal-festivo">{festivo.name || 'Festivo'}</div>
              )}
              {its.slice(0, 3).map((it, i) => (
                <div
                  key={i}
                  className={`cal-ev${it.important ? ' hot' : ''}`}
                  style={{ borderLeftColor: it.color, background: `color-mix(in srgb, ${it.color} ${it.important ? 20 : 9}%, transparent)` }}
                  onClick={(e) => { if (it.event || it.exam || it.task) { e.stopPropagation(); onOpen(it) } }}
                >
                  {it.start ? <span className="mono">{it.start} </span> : null}
                  {it.kind === 'exam' ? '★ ' : ''}{it.label}
                </div>
              ))}
              {its.length > 3 && <div className="dim" style={{ fontSize: 10 }}>+{its.length - 3} más</div>}
              {l > 0 && <div className="cal-load" style={{ width: `${Math.max(12, (l / maxLoad) * 100)}%` }} title={dur(l)} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ semana / día */

function TimeGrid({ days, itemsOf, onSlot, onOpen, onSelect, onDragEvent }) {
  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i)
  const cols = `52px repeat(${days.length}, minmax(0, 1fr))`
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nowTop = ((nowMin - DAY_START * 60) / 60) * HOUR_H

  return (
    <div className="cal-time">
      <div className="cal-time-head" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => {
          const dt = parseIso(d)
          return (
            <div key={d} className={d === today() ? 'on' : ''} onClick={() => onSelect(d)} style={{ cursor: 'pointer' }}>
              <div className="eyebrow">{DAYS[weekday(dt)]}</div>
              <div className="dnum">{dt.getDate()}</div>
            </div>
          )
        })}
      </div>

      <div className="cal-allday" style={{ display: 'grid', gridTemplateColumns: cols }}>
        <div className="cal-gutter" style={{ fontSize: 9, paddingTop: 5 }}>todo el día</div>
        {days.map((d) => (
          <div key={d} style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: 3 }}>
            {itemsOf(d).filter((i) => !i.start).map((it, k) => {
              const clickable = it.event || it.exam || it.task
              return (
                <span
                  key={k}
                  className={`cal-ev${it.important ? ' hot' : ''}`}
                  style={{
                    borderLeftColor: it.color,
                    background: `color-mix(in srgb, ${it.color} ${it.important ? 20 : 10}%, transparent)`,
                    marginBottom: 0,
                    cursor: clickable ? 'pointer' : 'default',
                  }}
                  onClick={() => clickable && onOpen(it)}
                >
                  {it.kind === 'exam' ? '★ ' : ''}{it.label}
                </span>
              )
            })}
          </div>
        ))}
      </div>

      <div className="cal-time-body">
        <div className="cal-time-grid" style={{ gridTemplateColumns: cols }}>
          <div className="cal-gutter">
            {hours.map((h) => <div className="cal-hour" key={h}>{String(h).padStart(2, '0')}:00</div>)}
          </div>
          {days.map((d, dayIndex) => (
            <div className="cal-col" key={d}>
              {hours.map((h) => (
                <div
                  className="cal-hour"
                  key={h}
                  onClick={() => onSlot(d, `${String(h).padStart(2, '0')}:00`)}
                  title={`Crear evento a las ${h}:00`}
                />
              ))}
              {d === today() && nowTop > 0 && nowTop < (DAY_END - DAY_START) * HOUR_H && (
                <div className="cal-now" style={{ top: nowTop }} />
              )}
              {layoutOverlaps(itemsOf(d).filter((i) => i.start)).map((it, k) => {
                const top = ((it._s - DAY_START * 60) / 60) * HOUR_H
                const height = Math.max(20, ((it._e - it._s) / 60) * HOUR_H - 2)
                if (top < -HOUR_H) return null
                return (
                  <EventBlock
                    key={k} it={it} days={days} dayIndex={dayIndex} top={top} height={height}
                    onOpen={onOpen} onDragEvent={onDragEvent}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Un bloque del horario. Si es un evento suelto —ni clase, ni examen, ni
 * repetición—, se puede arrastrar: verticalmente cambia la hora, en la vista
 * de semana también cambia de día al cruzar de columna. Mientras se arrastra
 * se mueve con un `transform`, sin volver a pintar nada; el cambio de verdad
 * —y el redibujado que trae— solo llega al soltar. Si el ratón apenas se ha
 * movido, cuenta como clic: abre el editor de siempre.
 */
function EventBlock({ it, days, dayIndex, top, height, onOpen, onDragEvent }) {
  const ref = useRef(null)
  const drag = useRef(null)
  const draggable = it.kind === 'event' && !it.event?.repeat?.freq && !!onDragEvent

  const style = { top, height, borderLeftColor: it.color, background: `color-mix(in srgb, ${it.color} ${it.important ? 22 : 11}%, var(--surface))` }
  if (it._cols > 1) {
    const pct = 100 / it._cols
    style.left = `calc(${it._col * pct}% + 2px)`
    style.width = `calc(${pct}% - 4px)`
    style.right = 'auto'
  }

  const onPointerDown = (e) => {
    if (!draggable || e.button !== 0) return
    const colWidth = ref.current?.closest('.cal-col')?.getBoundingClientRect().width || 0
    const s = it._s
    const dur = Math.max(15, it._e - it._s)
    drag.current = { startX: e.clientX, startY: e.clientY, moved: false, colWidth, s, dur, dayIndex, dayDelta: 0, minuteDelta: 0 }

    startDrag(
      e,
      (ev) => {
        const g = drag.current
        const dx = ev.clientX - g.startX
        const dy = ev.clientY - g.startY
        if (!g.moved && Math.hypot(dx, dy) < 4) return
        g.moved = true
        g.dayDelta = g.colWidth ? Math.round(dx / g.colWidth) : 0
        const snapPx = (HOUR_H * SNAP_MIN) / 60
        g.minuteDelta = Math.round(dy / snapPx) * SNAP_MIN
        if (ref.current) {
          ref.current.style.transform = `translate(${g.dayDelta * g.colWidth}px, ${(g.minuteDelta / 60) * HOUR_H}px)`
          ref.current.style.zIndex = 5
        }
      },
      () => {
        const g = drag.current
        if (ref.current) { ref.current.style.transform = ''; ref.current.style.zIndex = '' }
        if (!g.moved) { onOpen(it); return }
        const newDay = days[Math.min(days.length - 1, Math.max(0, g.dayIndex + g.dayDelta))]
        const newS = Math.max(DAY_START * 60, Math.min(DAY_END * 60 - g.dur, g.s + g.minuteDelta))
        onDragEvent(it.event, { date: newDay, start: fromMin(newS), end: fromMin(newS + g.dur) })
      }
    )
  }

  return (
    <div
      ref={ref}
      className={`cal-block${it.important ? ' hot' : ''}${draggable ? ' draggable' : ''}`}
      style={style}
      onPointerDown={onPointerDown}
      onClick={() => !draggable && onOpen(it)}
      title={draggable ? `${it.label} · ${it.detail} · arrastra para moverlo` : `${it.label} · ${it.detail}`}
    >
      <div className="t">{it.start}{it.end ? `–${it.end}` : ''}</div>
      <div style={{ fontWeight: 600 }}>{it.kind === 'exam' ? '★ ' : ''}{it.label}</div>
      {height > 44 && <div className="dim" style={{ fontSize: 10 }}>{it.detail}</div>}
    </div>
  )
}

function DayPanel({ date, itemsOf, load, onOpen, onNew, onNewTask, onNewExam }) {
  const { db, update } = useStore()
  const items = itemsOf(date)
  const festivo = holidayOn(db, date)
  // Cuántas clases habría hoy si no fuera festivo: es lo que se va a quitar, y
  // decirlo es más útil que un botón mudo.
  const quita = classesBetween(db, date, date)

  const marcar = () =>
    update((d) => {
      d.holidays ||= []
      d.holidays.push({ id: uid('fest'), name: 'Festivo', from: date, to: date })
    })

  const desmarcar = () =>
    update((d) => {
      const h = (d.holidays || []).find((x) => date >= x.from && date <= (x.to || x.from))
      if (!h) return
      // Un día suelto se quita entero; un día de en medio de las vacaciones no
      // se puede «desmarcar» sin partir el rango en dos, así que se dice.
      if (h.from === date && (h.to || h.from) === date) {
        d.holidays = d.holidays.filter((x) => x.id !== h.id)
      } else if (h.from === date) {
        h.from = iso(addDays(parseIso(date), 1))
      } else if ((h.to || h.from) === date) {
        h.to = iso(addDays(parseIso(date), -1))
      } else {
        const fin = h.to || h.from
        h.to = iso(addDays(parseIso(date), -1))
        d.holidays.push({ id: uid('fest'), name: h.name, from: iso(addDays(parseIso(date), 1)), to: fin })
      }
    })

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h3 style={{ textTransform: 'capitalize' }}>
            {parseIso(date).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          <span className="mono dim" style={{ fontSize: 11 }}>{dur(load(date))}</span>
        </div>
        {festivo && (
          <div className="notice" style={{ marginBottom: 10 }}>
            <Icon name="sun" size={13} />
            <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              <b>{festivo.name || 'Festivo'}</b>
              {(festivo.to || festivo.from) !== festivo.from && ` · del ${festivo.from} al ${festivo.to}`}
              {' — '}hoy no hay clase, así que no cuenta para la asistencia.
            </span>
          </div>
        )}
        {items.length ? (
          <div className="list">
            {items.map((it, i) => (
              <div key={i} className="list-row click" onClick={() => onOpen(it)}>
                <span className="dot" style={{ background: it.color }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: it.important ? 600 : 400 }}>
                    {it.kind === 'exam' ? '★ ' : ''}{it.label}
                  </div>
                  <div className="dim" style={{ fontSize: 11 }}>
                    {it.detail}{it.start ? ` · ${it.start}${it.end ? `–${it.end}` : ''}` : ''}
                    {it.event?.repeat?.freq ? ' · se repite' : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Día libre.</p>
        )}
        <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
          <button className="btn sm" onClick={onNew}><Icon name="plus" size={12} /> Evento</button>
          <button className="btn sm ghost" onClick={onNewTask}><Icon name="plus" size={12} /> Tarea</button>
          <button className="btn sm ghost" onClick={onNewExam}><Icon name="plus" size={12} /> Examen</button>
          <div className="spacer" />
          {festivo ? (
            <button className="btn sm ghost" onClick={desmarcar} title="Vuelve a haber clase este día">
              <Icon name="x" size={12} /> Quitar el festivo
            </button>
          ) : (
            <button
              className="btn sm ghost"
              onClick={marcar}
              title={quita ? `Deja sin clase ${quita} ${quita === 1 ? 'asignatura' : 'asignaturas'} de hoy` : 'Hoy no había clase de todos modos'}
            >
              <Icon name="sun" size={12} /> Marcar festivo{quita ? ` (−${quita})` : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- formulario */

export function EventForm({ event, onClose }) {
  const { db, update } = useStore()
  const [e, setE] = useState({ ...event, repeat: event.repeat || { freq: '', interval: 1, byday: [], until: '' } })
  const [newCat, setNewCat] = useState('')
  const exists = db.events.some((x) => x.id === e.id)
  const set = (p) => setE((x) => ({ ...x, ...p }))
  const setR = (p) => setE((x) => ({ ...x, repeat: { ...x.repeat, ...p } }))

  const addCategory = () => {
    if (!newCat.trim()) return
    const cat = { id: uid('cat'), name: newCat.trim(), color: PALETTE[db.categories.length % PALETTE.length], area: 'life' }
    update((d) => d.categories.push(cat))
    set({ categoryId: cat.id })
    setNewCat('')
  }

  const save = () => {
    if (!e.title.trim()) return
    const value = { ...e, repeat: e.repeat.freq ? e.repeat : null }
    update((d) => {
      const i = d.events.findIndex((x) => x.id === value.id)
      // al editar una repetición se guarda sobre la fecha original de la serie
      if (i >= 0) d.events[i] = { ...value, date: value.baseDate || value.date }
      else d.events.push(value)
    })
    onClose()
  }

  const skipThisDay = () => {
    update((d) => {
      const ev = d.events.find((x) => x.id === e.id)
      if (ev) ev.exceptions = [...new Set([...(ev.exceptions || []), e.date])]
    })
    onClose()
  }

  return (
    <Modal
      title={exists ? 'Editar evento' : 'Nuevo evento'}
      subtitle={e.repeated ? `Aparición del ${e.date} · la serie empieza el ${e.baseDate}` : undefined}
      onClose={onClose}
      foot={
        <>
          {exists && (
            <button className="btn ghost danger" onClick={() => { update((d) => { d.events = d.events.filter((x) => x.id !== e.id) }); onClose() }}>
              <Icon name="trash" size={13} /> {e.repeat?.freq ? 'Borrar serie' : 'Eliminar'}
            </button>
          )}
          {e.repeated && <button className="btn ghost" onClick={skipThisDay}>Saltar este día</button>}
          <div className="spacer" />
          <button className="btn primary" onClick={save}>Guardar</button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          <label>Título</label>
          <input className="input" autoFocus value={e.title} placeholder="Analítica de sangre, clase de conducir…" onChange={(ev) => set({ title: ev.target.value })} />
        </div>

        <div className="field">
          <label>Categoría</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {db.categories.map((c) => (
              <button key={c.id} className={`chip${e.categoryId === c.id ? ' on' : ''}`} onClick={() => set({ categoryId: c.id })}>
                <span className="dot" style={{ background: c.color }} /> {c.name}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <input
              className="input"
              style={{ maxWidth: 220 }}
              placeholder="Nueva categoría…"
              value={newCat}
              onChange={(ev) => setNewCat(ev.target.value)}
              onKeyDown={(ev) => ev.key === 'Enter' && addCategory()}
            />
            <button className="btn sm" onClick={addCategory} disabled={!newCat.trim()}><Icon name="plus" size={12} /> Crear</button>
          </div>
        </div>

        <div className="grid-3">
          <div className="field"><label>Fecha</label><input className="input" type="date" value={e.date} onChange={(ev) => set({ date: ev.target.value })} /></div>
          <div className="field"><label>Desde</label><input className="input" type="time" value={e.start || ''} onChange={(ev) => set({ start: ev.target.value })} /></div>
          <div className="field"><label>Hasta</label><input className="input" type="time" value={e.end || ''} onChange={(ev) => set({ end: ev.target.value })} /></div>
        </div>

        <div className="card flat" style={{ padding: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Repetición</div>
          <div className="row wrap" style={{ gap: 8 }}>
            <select className="select" style={{ maxWidth: 170 }} value={e.repeat.freq} onChange={(ev) => setR({ freq: ev.target.value })}>
              {FREQ.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            {e.repeat.freq && (
              <>
                <span className="dim" style={{ fontSize: 12 }}>cada</span>
                <input className="input" style={{ width: 62 }} type="number" min="1" max="30" value={e.repeat.interval} onChange={(ev) => setR({ interval: Number(ev.target.value) })} />
                <span className="dim" style={{ fontSize: 12 }}>
                  {e.repeat.freq === 'daily' ? 'días' : e.repeat.freq === 'weekly' ? 'semanas' : e.repeat.freq === 'monthly' ? 'meses' : 'años'}
                </span>
              </>
            )}
          </div>

          {e.repeat.freq === 'weekly' && (
            <div className="row wrap" style={{ gap: 4, marginTop: 10 }}>
              {DAYS.map((d, i) => (
                <button
                  key={i}
                  className={`chip${e.repeat.byday?.includes(i) ? ' on' : ''}`}
                  onClick={() => setR({ byday: e.repeat.byday?.includes(i) ? e.repeat.byday.filter((x) => x !== i) : [...(e.repeat.byday || []), i].sort() })}
                >
                  {d}
                </button>
              ))}
            </div>
          )}

          {e.repeat.freq && (
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <label className="dim" style={{ fontSize: 12 }}>Hasta</label>
              <input className="input" style={{ maxWidth: 170 }} type="date" value={e.repeat.until || ''} onChange={(ev) => setR({ until: ev.target.value })} />
              {e.repeat.until && <button className="btn sm ghost" onClick={() => setR({ until: '' })}>Sin fin</button>}
            </div>
          )}

          {e.repeat.freq && <p className="dim" style={{ fontSize: 11.5, margin: '10px 0 0' }}>Se repetirá {repeatLabel(e.repeat)}.</p>}
        </div>

        <div className="field"><label>Notas</label><textarea className="textarea" value={e.notes || ''} onChange={(ev) => set({ notes: ev.target.value })} /></div>
      </div>
    </Modal>
  )
}
