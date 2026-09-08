import React, { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import TaskList from '../components/TaskList.jsx'
import TaskEditor, { newTask } from '../components/TaskEditor.jsx'
import ExamEditor, { ExamRow, newExam } from '../components/ExamEditor.jsx'
import LogTime from '../components/LogTime.jsx'
import { SubjectForm } from './Uni.jsx'
import { useStore } from '../lib/store.jsx'
import { useTracker } from '../lib/tracker.jsx'
import { api } from '../lib/api.js'
import { subjectStats, attendanceBudget, classOccurrences, termWindow, slotRange } from '../lib/stats.js'
import { dur, DAYS, iso, addDays, parseIso, today, fmtDate, startOfWeek, daysUntil } from '../lib/date.js'

const STATUS = ['present', 'absent', 'late', 'excused']
const STATUS_LABEL = { present: 'Asistí', absent: 'Falté', late: 'Tarde', excused: 'Justificada' }
const STATUS_MARK = { present: '·', absent: '✕', late: 'T', excused: 'J' }

export default function SubjectDetail({ id }) {
  const { db, toast } = useStore()
  const { start, focus } = useTracker()
  const [tab, setTab] = useState('resumen')
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(null)
  const [exam, setExam] = useState(null)

  const s = db.subjects.find((x) => x.id === id)
  if (!s) {
    return <div className="empty"><div className="display">Esa asignatura ya no existe</div><a className="btn" href="#/uni">Volver</a></div>
  }

  const st = subjectStats(db, s.id)
  const b = attendanceBudget(db, s.id)
  const tasks = db.tasks.filter((t) => t.refId === s.id)
  const working = focus?.refId === s.id && !focus?.taskId

  const work = () => {
    start({ area: 'uni', refId: s.id, taskId: null, label: s.name })
    toast(`Contando tiempo en ${s.name}. Sigue corriendo aunque salgas de la app.`)
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <a className="btn sm ghost" href="#/uni"><Icon name="chevronL" size={13} /> Asignaturas</a>
      </div>

      <div className="page-head">
        <div>
          <div className="eyebrow row" style={{ gap: 6 }}>
            <span className="dot" style={{ background: s.color }} />
            {s.code || 'Asignatura'}{s.professor ? ` · ${s.professor}` : ''}{s.credits ? ` · ${s.credits} ECTS` : ''}
          </div>
          <h2>{s.name}</h2>
        </div>
        <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
          <button className={`btn ${working ? '' : 'primary'}`} disabled={working} onClick={work} title="Cuenta el tiempo estés donde estés, dentro o fuera de la app">
            <Icon name="play" size={12} fill="currentColor" /> {working ? 'Contando…' : 'Trabajar en esto'}
          </button>
          <LogTime area="uni" refId={s.id} label={s.name} />
          <a className="btn" href={`#/espacio/uni/${s.id}`}>
            <Icon name="layers" size={13} /> Espacio
          </a>
          {s.isProgramming && (
            <button className="btn ghost" title="Abrir en VS Code" onClick={() => api.openInCode(s.repoPath || s.folder).then(() => toast('Abriendo VS Code…')).catch((e) => toast(e.message, 'err'))}>
              <Icon name="code" size={13} />
            </button>
          )}
          {s.portalUrl && <button className="btn ghost" title="Campus" onClick={() => api.openUrl(s.portalUrl)}><Icon name="external" size={13} /></button>}
          <button className="btn ghost" title="Editar asignatura" onClick={() => setEditing(true)}><Icon name="settings" size={13} /></button>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 22 }}>
        <div className="stat">
          <div className="eyebrow">Trabajo de la semana</div>
          <div className="value num" style={{ color: st.week.pct >= 100 ? 'var(--green)' : '' }}>{st.week.pct}<span>%</span></div>
          <div className="meter" style={{ marginTop: 10 }}>
            <i style={{ width: `${Math.min(100, st.week.pct)}%`, background: st.week.pct >= 100 ? 'var(--green)' : s.color }} />
          </div>
          <div className="delta dim">{dur(st.week.seconds)} de {st.week.goal} h{st.week.tasks ? ` · ${st.week.tasksDone}/${st.week.tasks} entregas` : ''}</div>
        </div>

        <div className="stat">
          <div className="eyebrow">Faltas que te quedan</div>
          <div className="value num" style={{ color: b.doomed ? 'var(--accent)' : b.left <= 1 ? 'var(--amber)' : '' }}>
            {b.totalCounted ? (b.doomed ? '0' : b.left) : '—'}
          </div>
          <div className="delta dim">
            {b.totalCounted
              ? `llevas ${b.absences} de ${b.maxAbsences} · mínimo ${Math.round(b.minRate * 100)}%`
              : 'configura el horario'}
          </div>
        </div>

        <div className="stat">
          <div className="eyebrow">Tiempo dedicado</div>
          <div className="value num">{(st.seconds / 3600).toFixed(1)}<span>h</span></div>
          <div className="delta dim">en total desde que existe</div>
        </div>

        <div className="stat">
          <div className="eyebrow">{st.nextExam ? 'Próximo examen' : 'Pendiente'}</div>
          {st.nextExam ? (
            <>
              <div className="value num">{Math.max(0, daysUntil(st.nextExam.date))}<span>d</span></div>
              <div className="delta dim">{st.nextExam.title} · {fmtDate(st.nextExam.date)}</div>
            </>
          ) : (
            <>
              <div className="value num">{st.open.length}</div>
              <div className="delta dim">{st.nextDue ? `próxima: ${fmtDate(st.nextDue.due)}` : 'sin fechas próximas'}</div>
            </>
          )}
        </div>
      </div>

      {b.doomed && b.totalCounted > 0 && (
        <div className="notice err" style={{ marginBottom: 18 }}>
          <Icon name="x" size={13} />
          <span>
            Con {b.absences} faltas ya no llegas al {Math.round(b.minRate * 100)}% aunque vayas a las {b.upcoming} clases
            que quedan. Habla con el profesor.
          </span>
        </div>
      )}
      {!b.reliable && (s.schedule || []).length > 0 && (
        <div className="notice" style={{ marginBottom: 18 }}>
          <Icon name="clock" size={13} />
          <span>
            Alguna clase del horario no tiene fecha de fin, así que el total de clases del curso es
            una estimación y las faltas que te quedan también.{' '}
            <button className="linkish" onClick={() => setEditing(true)}>Poner fechas</button>
          </span>
        </div>
      )}

      <div className="tabs">
        {[
          ['resumen', 'Resumen'],
          ['asistencia', 'Asistencia'],
          ['evaluacion', `Evaluación (${st.exams.length})`],
          ['tareas', `Tareas (${tasks.filter((t) => t.status !== 'done').length})`],
        ].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'resumen' && <Resumen subject={s} />}
      {tab === 'asistencia' && <Attendance subject={s} />}
      {tab === 'evaluacion' && <Evaluacion subject={s} exams={st.exams} onOpen={setExam} />}
      {tab === 'tareas' && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="spacer" />
            <button className="btn sm" onClick={() => setAdding(newTask({ area: 'uni', refId: s.id }))}>
              <Icon name="plus" size={12} /> Tarea de {s.name}
            </button>
          </div>
          <TaskList
            tasks={[...tasks].sort((a, b2) => (a.status === 'done') - (b2.status === 'done') || (a.due || 'z').localeCompare(b2.due || 'z'))}
            showArea={false}
            onQuickAdd={() => setAdding(newTask({ area: 'uni', refId: s.id }))}
          />
        </>
      )}

      {editing && <SubjectForm subject={s} onClose={() => setEditing(false)} />}
      {adding && <TaskEditor task={adding} onClose={() => setAdding(null)} />}
      {exam && <ExamEditor exam={exam} onClose={() => setExam(null)} />}
    </>
  )
}

/** Exámenes, entregas evaluables y cuánta nota llevas jugada. */
function Evaluacion({ subject, exams, onOpen }) {
  const graded = exams.filter((e) => e.grade != null && e.weight > 0)
  const weightDone = graded.reduce((a, e) => a + e.weight, 0)
  const weightTotal = exams.reduce((a, e) => a + (e.weight || 0), 0)
  const nota = weightDone ? graded.reduce((a, e) => a + e.grade * e.weight, 0) / weightDone : null
  const pasados = exams.filter((e) => e.date < today())
  const futuros = exams.filter((e) => e.date >= today())

  return (
    <div className="stack">
      <div className="row" style={{ marginBottom: 2 }}>
        <div className="spacer" />
        <button className="btn sm primary" onClick={() => onOpen(newExam({ subjectId: subject.id }))}>
          <Icon name="plus" size={12} /> Examen o entrega
        </button>
      </div>

      {exams.length === 0 ? (
        <div className="empty">
          <div className="display">Sin exámenes ni entregas</div>
          <p style={{ maxWidth: '44ch', margin: '0 auto 14px' }}>
            Apunta aquí los parciales, el final y las entregas que puntúan, con su fecha y su peso.
            Aparecen en el calendario y el ayudante los tiene en cuenta.
          </p>
          <button className="btn primary" onClick={() => onOpen(newExam({ subjectId: subject.id }))}>
            <Icon name="plus" size={13} /> Añadir el primero
          </button>
        </div>
      ) : (
        <>
          <div className="grid-3">
            <div className="stat">
              <div className="eyebrow">Nota provisional</div>
              <div className="value num">{nota === null ? '—' : nota.toFixed(1)}</div>
              <div className="delta dim">sobre lo ya evaluado</div>
            </div>
            <div className="stat">
              <div className="eyebrow">Nota ya jugada</div>
              <div className="value num">{weightDone}<span>%</span></div>
              <div className="meter" style={{ marginTop: 10 }}><i style={{ width: `${Math.min(100, weightDone)}%`, background: subject.color }} /></div>
              <div className="delta dim">de {weightTotal || 100}% repartido</div>
            </div>
            <div className="stat">
              <div className="eyebrow">Por delante</div>
              <div className="value num">{futuros.length}</div>
              <div className="delta dim">{futuros[0] ? `${futuros[0].title} · ${fmtDate(futuros[0].date)}` : 'nada pendiente'}</div>
            </div>
          </div>

          {futuros.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>Por venir</h3></div>
              <div className="list">
                {futuros.map((e) => <ExamRow key={e.id} exam={e} subject={subject} onClick={() => onOpen(e)} />)}
              </div>
            </div>
          )}
          {pasados.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>Ya hechos</h3></div>
              <div className="list">
                {pasados.map((e) => <ExamRow key={e.id} exam={e} subject={subject} onClick={() => onOpen(e)} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Resumen({ subject: s }) {
  const { db } = useStore()
  const weeks = useMemo(() => {
    const out = []
    for (let i = 7; i >= 0; i--) {
      const start = iso(addDays(startOfWeek(new Date()), -7 * i))
      const end = iso(addDays(parseIso(start), 6))
      out.push(db.sessions.filter((x) => x.refId === s.id && x.date >= start && x.date <= end).reduce((a, x) => a + x.seconds, 0))
    }
    return out
  }, [db.sessions, s.id])
  const max = Math.max(...weeks, 1)

  return (
    <div className="split even">
      <div className="card">
        <div className="card-head"><h3>Horas por semana (últimas 8)</h3></div>
        <div className="bars">
          {weeks.map((v, i) => (
            <div className="col" key={i} title={dur(v)}>
              <div className="seg-bar" style={{ height: `${(v / max) * 100}%`, background: i === weeks.length - 1 ? s.color : 'var(--line-strong)' }} />
            </div>
          ))}
        </div>
        <div className="axis">{weeks.map((_, i) => <span key={i}>{i === weeks.length - 1 ? 'ahora' : `-${weeks.length - 1 - i}`}</span>)}</div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-head"><h3>Horario</h3></div>
          {(s.schedule || []).length ? (
            <div className="list">
              {s.schedule.map((sl, i) => {
                const r = slotRange(sl, db.settings)
                const over = r.until && r.until < today()
                return (
                  <div key={i} className="list-row" style={{ opacity: over ? 0.5 : 1 }}>
                    <span style={{ width: 40 }}>{DAYS[sl.day]}</span>
                    <span className="mono">{sl.start} – {sl.end}</span>
                    <div className="spacer" />
                    <span className="dim" style={{ fontSize: 11 }}>
                      {r.until
                        ? `${r.from ? fmtDate(r.from, { absolute: true }) : '…'} → ${fmtDate(r.until, { absolute: true })}`
                        : 'sin fin'}
                    </span>
                    {sl.room && <span className="badge">{sl.room}</span>}
                  </div>
                )
              })}
            </div>
          ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Sin horario configurado.</p>}
        </div>

        <div className="card">
          <div className="card-head"><h3>Carpeta en tu disco</h3></div>
          <p className="mono dim" style={{ fontSize: 11.5, margin: '0 0 10px', wordBreak: 'break-all' }}>{s.folder}</p>
          <div className="row" style={{ gap: 6 }}>
            <a className="btn sm" href={`#/espacio/uni/${s.id}`}><Icon name="layers" size={12} /> Espacio</a>
            <button className="btn sm ghost" onClick={() => api.openPath(s.folder)}><Icon name="external" size={12} /> Explorador</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Registro de asistencia generado a partir del horario, respetando el rango de
 * fechas de cada clase: una clase que ya terminó no sigue generando casillas.
 */
function Attendance({ subject }) {
  const { db, applyChange } = useStore()
  const b = attendanceBudget(db, subject.id)

  const occurrences = useMemo(() => {
    const { from, to } = termWindow(db)
    return classOccurrences(db, subject, from, to).map((o) => ({
      date: o.date, slot: o.slotIndex, time: o.slot.start, room: o.slot.room,
    }))
  }, [subject, db.settings.termStart, db.settings.termEnd])

  const statusOf = (o) =>
    db.attendance.find((a) => a.subjectId === subject.id && a.date === o.date && a.slot === o.slot)?.status || null

  /**
   * La asistencia se apunta con `applyChange` y no con `update`: así se puede
   * marcar en clase aunque el ordenador esté apagado en casa. Sin conexión el
   * cambio se guarda en la cola y entra cuando el ordenador vuelve, sin tocar
   * nada más de la base.
   */
  const cycle = (o) => {
    const cur = statusOf(o)
    const next = cur === null ? 'present' : STATUS[(STATUS.indexOf(cur) + 1) % STATUS.length]
    const clear = cur === 'excused'
    applyChange({ kind: 'asistencia', subjectId: subject.id, date: o.date, slot: o.slot, status: clear ? null : next })
  }

  /** Marcar de golpe todas las clases pasadas sin registrar: casi siempre fuiste. */
  const fillPast = () => {
    const pending = occurrences.filter((o) => o.date <= today() && !statusOf(o))
    if (!pending.length) return
    if (!confirm(`¿Marcar como asistidas las ${pending.length} clases pasadas sin registrar?`)) return
    for (const o of pending) {
      applyChange({ kind: 'asistencia', subjectId: subject.id, date: o.date, slot: o.slot, status: 'present' })
    }
  }

  if (!occurrences.length) {
    return (
      <div className="empty">
        <div className="display">Sin horario, sin asistencia</div>
        <p style={{ maxWidth: '44ch', margin: '0 auto' }}>
          Configura el horario semanal con sus fechas de inicio y fin, y aquí aparecerá una casilla
          por cada clase del cuatrimestre. Clic para ir cambiando: asistí → falté → tarde → justificada.
        </p>
      </div>
    )
  }

  const byMonth = occurrences.reduce((acc, o) => { (acc[o.date.slice(0, 7)] ||= []).push(o); return acc }, {})
  const counted = occurrences.filter((o) => o.date <= today() && statusOf(o) && statusOf(o) !== 'excused')
  const ok = counted.filter((o) => ['present', 'late'].includes(statusOf(o))).length
  const unmarked = occurrences.filter((o) => o.date <= today() && !statusOf(o)).length

  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 10 }}>
        <div className="card" style={{ flex: 1, minWidth: 190 }}>
          <div className="eyebrow">Asistencia real</div>
          <div className="num" style={{ fontSize: 34 }}>{counted.length ? Math.round((ok / counted.length) * 100) : 0}%</div>
          <div className="dim" style={{ fontSize: 12 }}>{ok} de {counted.length} clases registradas</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 190 }}>
          <div className="eyebrow">Margen que te queda</div>
          <div className="num" style={{ fontSize: 34, color: b.doomed ? 'var(--accent)' : b.left <= 1 ? 'var(--amber)' : 'var(--green)' }}>
            {b.doomed ? 0 : b.left}
          </div>
          <div className="dim" style={{ fontSize: 12 }}>
            faltas más de {b.maxAbsences} permitidas sobre {b.totalCounted} clases
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 190 }}>
          <div className="eyebrow">Sin marcar</div>
          <div className="num" style={{ fontSize: 34, color: unmarked ? 'var(--amber)' : '' }}>{unmarked}</div>
          {unmarked > 0 ? (
            <button className="btn sm ghost" style={{ marginTop: 4 }} onClick={fillPast}>
              <Icon name="check" size={11} /> Marcar todas como asistidas
            </button>
          ) : (
            <div className="dim" style={{ fontSize: 12 }}>todo al día</div>
          )}
        </div>
        <div className="card" style={{ flex: 1.4, minWidth: 220 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Leyenda</div>
          <div className="row wrap" style={{ gap: 8 }}>
            {STATUS.map((k) => (
              <span key={k} className="row" style={{ gap: 5, fontSize: 12 }}>
                <span className={`att-cell ${k}`} style={{ width: 16, height: 16 }} /> {STATUS_LABEL[k]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {Object.entries(byMonth).map(([month, list]) => (
        <div className="card" key={month}>
          <div className="card-head">
            <h3 style={{ textTransform: 'capitalize' }}>
              {parseIso(month + '-01').toLocaleDateString('es', { month: 'long', year: 'numeric' })}
            </h3>
            <span className="dim mono" style={{ fontSize: 11 }}>{list.length} clases</span>
          </div>
          <div className="att-grid">
            {list.map((o) => {
              const st = statusOf(o)
              const future = o.date > today()
              return (
                <button
                  key={o.date + o.slot}
                  className={`att-cell ${st || ''}`}
                  style={{ opacity: future ? 0.35 : 1 }}
                  title={`${o.date} ${o.time || ''} — ${st ? STATUS_LABEL[st] : 'sin marcar'}`}
                  onClick={() => !future && cycle(o)}
                >
                  {st ? STATUS_MARK[st] : parseIso(o.date).getDate()}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
