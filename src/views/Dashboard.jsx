import React, { useState } from 'react'
import Icon from '../components/Icon.jsx'
import TaskList from '../components/TaskList.jsx'
import TaskEditor, { newTask } from '../components/TaskEditor.jsx'
import ExamEditor, { ExamRow } from '../components/ExamEditor.jsx'
import { useStore, AREAS, refColor } from '../lib/store.jsx'
import { useTracker } from '../lib/tracker.jsx'
import { today, dur, fmtDate, daysUntil, DAYS, startOfWeek, addDays, MONTHS, iso } from '../lib/date.js'
import { weekSummary, weekProgress, delta, pct, classesOn, streak, upcomingExams } from '../lib/stats.js'

export default function Dashboard() {
  const { db, update, toast } = useStore()
  const { start } = useTracker()
  const [adding, setAdding] = useState(null)
  const [exam, setExam] = useState(null)

  const now = new Date()
  const week = weekSummary(db, startOfWeek(now))
  const prev = weekSummary(db, addDays(startOfWeek(now), -7))
  const progress = weekProgress(db)
  const exams = upcomingExams(db, 30)
  const todaySecs = db.sessions.filter((s) => s.date === today()).reduce((a, s) => a + s.seconds, 0)
  const goal = (db.settings.dailyGoalMin || 300) * 60
  const classes = classesOn(db)
  const racha = streak(db)
  const training = db.training.find((t) => t.date === today())

  const open = db.tasks.filter((t) => t.status !== 'done')
  const dueToday = open.filter((t) => t.due && daysUntil(t.due) <= 0)
  const soon = open.filter((t) => t.due && daysUntil(t.due) > 0 && daysUntil(t.due) <= 7)

  const d = delta(week.total, prev.total)
  const hour = now.getHours()
  const hi = hour < 6 ? 'Buenas noches' : hour < 13 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{DAYS[(now.getDay() + 6) % 7]} · {now.getDate()} de {MONTHS[now.getMonth()].toLowerCase()}</div>
          <h2>{hi}{db.profile?.name ? `, ${db.profile.name}` : ''}.</h2>
          <p>
            {dueToday.length
              ? `${dueToday.length} ${dueToday.length === 1 ? 'tarea vence' : 'tareas vencen'} hoy o antes.`
              : 'Nada vence hoy. Buen momento para adelantar.'}
            {racha > 1 && ` Racha de ${racha} días seguidos trabajando.`}
          </p>
        </div>
        <button className="btn" onClick={() => setAdding(newTask())}>
          <Icon name="plus" size={13} /> Nueva tarea <span className="kbd">N</span>
        </button>
      </div>

      <div className="grid-3" style={{ marginBottom: 22 }}>
        <div className="stat">
          <div className="eyebrow">Hoy</div>
          <div className="value num">
            {Math.floor(todaySecs / 3600)}<span>h</span>{String(Math.floor((todaySecs % 3600) / 60)).padStart(2, '0')}<span>m</span>
          </div>
          <div className="meter" style={{ marginTop: 12 }}><i style={{ width: `${Math.min(100, (todaySecs / goal) * 100)}%` }} /></div>
          <div className="delta dim">objetivo {dur(goal)}</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Trabajo semanal hecho</div>
          <div className="value num" style={{ color: progress.pct >= 100 ? 'var(--green)' : '' }}>
            {progress.pct}<span>%</span>
          </div>
          <div className="meter" style={{ marginTop: 12 }}>
            <i style={{ width: `${Math.min(100, progress.pct)}%`, background: progress.pct >= 100 ? 'var(--green)' : 'var(--ink)' }} />
          </div>
          <div className="delta dim">
            {(week.total / 3600).toFixed(1)} h de {progress.goal} h
            {progress.tasks ? ` · ${progress.tasksDone}/${progress.tasks} entregas` : ''}
            {d !== null && prev.total > 0 ? ` · ${pct(d)} vs. semana pasada` : ''}
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">Reparto semanal</div>
          <div className="stack" style={{ gap: 7, marginTop: 6 }}>
            {Object.entries(AREAS).map(([k, v]) => {
              const s = week.byArea[k] || 0
              return (
                <div key={k} className="row" style={{ gap: 8, fontSize: 12 }}>
                  <span className="dot" style={{ background: v.color }} />
                  <span style={{ width: 74 }}>{v.label}</span>
                  <div className="meter" style={{ flex: 1 }}><i style={{ width: `${week.total ? (s / week.total) * 100 : 0}%`, background: v.color }} /></div>
                  <span className="mono dim" style={{ width: 40, textAlign: 'right' }}>{dur(s)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="split wide-left">
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h3>Vence hoy o está atrasado</h3>
              <a className="btn sm ghost" href="#/tareas">Todas <Icon name="chevronR" size={12} /></a>
            </div>
            <TaskList tasks={dueToday} empty="Al día." onQuickAdd={() => setAdding(newTask({ due: today() }))} />
          </div>

          {soon.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>Los próximos 7 días</h3></div>
              <TaskList tasks={soon.sort((a, b) => a.due.localeCompare(b.due))} />
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h3>Seguir con lo de siempre</h3>
              <span className="dim" style={{ fontSize: 11.5 }}>empieza a contar y trabaja donde quieras</span>
            </div>
            <div className="stack" style={{ gap: 5 }}>
              {recent(db).map((r) => (
                <div key={r.key} className="link-tile" style={{ cursor: 'default' }}>
                  <span className="glyph" style={{ background: r.color }}><Icon name="layers" size={11} /></span>
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
              {recent(db).length === 0 && (
                <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
                  Pulsa «Trabajar en…» arriba y elige una asignatura. El cronómetro sigue corriendo
                  aunque salgas de la app o trabajes en papel.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h3>Clases de hoy</h3>
              <a className="btn sm ghost" href="#/calendario"><Icon name="chevronR" size={12} /></a>
            </div>
            {classes.length ? (
              <div className="list">
                {classes.map(({ subject, slot, slotIndex }, i) => {
                  const marked = db.attendance.find((a) => a.subjectId === subject.id && a.date === today() && a.slot === slotIndex)
                  return (
                    <div key={subject.id + i} className="list-row">
                      <span className="dot" style={{ background: subject.color }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a href={`#/uni/${subject.id}`} style={{ fontSize: 13, textDecoration: 'none' }}>{subject.name}</a>
                        <div className="dim mono" style={{ fontSize: 11 }}>{slot.start}–{slot.end}{slot.room ? ` · ${slot.room}` : ''}</div>
                      </div>
                      <button
                        className={`btn sm${marked ? ' ghost' : ''}`}
                        title={marked ? `Marcado: ${marked.status}` : 'Marcar asistencia'}
                        onClick={() =>
                          update((dd) => {
                            const idx = dd.attendance.findIndex((a) => a.subjectId === subject.id && a.date === today() && a.slot === slotIndex)
                            if (idx >= 0) dd.attendance.splice(idx, 1)
                            else dd.attendance.push({ id: `${subject.id}-${today()}-${slotIndex}`, subjectId: subject.id, date: today(), slot: slotIndex, status: 'present' })
                          })
                        }
                      >
                        <Icon name="check" size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Hoy no hay clases en el horario.</p>
            )}
          </div>

          {exams.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h3>Exámenes y entregas</h3>
                <span className="dim" style={{ fontSize: 11.5 }}>próximos 30 días</span>
              </div>
              <div className="list">
                {exams.slice(0, 5).map((e) => (
                  <ExamRow key={e.id} exam={e} subject={e.subject} onClick={() => setExam(e)} />
                ))}
              </div>
              {exams[0] && (
                <p className="dim" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
                  Lo más cercano: {exams[0].title} el {fmtDate(exams[0].date)}
                  {daysUntil(exams[0].date) > 0 ? ` — quedan ${daysUntil(exams[0].date)} días` : ''}.
                </p>
              )}
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h3>Entrenamiento</h3>
              <a className="btn sm ghost" href="#/atletismo"><Icon name="chevronR" size={12} /></a>
            </div>
            {training?.done ? (
              <div className="row" style={{ gap: 10 }}>
                <span className="dot" style={{ background: 'var(--green)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>{training.type}</div>
                  <div className="dim" style={{ fontSize: 11 }}>RPE {training.rpe} · {training.minutes} min</div>
                </div>
              </div>
            ) : (
              <a className="btn sm" href="#/atletismo"><Icon name="plus" size={12} /> Registrar el entreno de hoy</a>
            )}
            <div className="dim" style={{ fontSize: 11.5, marginTop: 10 }}>
              {db.training.filter((t) => t.done && t.date >= iso(startOfWeek(now))).length} de{' '}
              {db.settings.weeklyTrainingGoal || 5} sesiones esta semana
            </div>
          </div>
        </div>
      </div>

      {adding && <TaskEditor task={adding} onClose={() => setAdding(null)} />}
      {exam && <ExamEditor exam={exam} onClose={() => setExam(null)} />}
    </>
  )
}

/** Las cuatro cosas en las que más has trabajado últimamente. */
function recent(db) {
  const seen = new Map()
  for (const s of [...db.sessions].reverse()) {
    if (!s.refId && !s.taskId) continue
    if (s.area === 'sport' || s.area === 'life') continue
    const key = `${s.area}:${s.refId || '-'}:${s.taskId || '-'}`
    if (seen.has(key)) { seen.get(key).seconds += s.seconds; continue }
    if (seen.size >= 4) continue
    seen.set(key, {
      key,
      href: s.taskId ? `#/espacio/tarea/${s.taskId}` : `#/espacio/${s.area === 'uni' ? 'uni' : 'trabajo'}/${s.refId}`,
      label: s.label,
      seconds: s.seconds,
      color: refColor(db, s),
      ctx: { area: s.area, refId: s.refId || null, taskId: s.taskId || null, label: s.label },
    })
  }
  return [...seen.values()]
}
