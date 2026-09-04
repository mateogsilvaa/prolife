import React, { useState } from 'react'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import { useStore, uid, slug, PALETTE } from '../lib/store.jsx'
import { useTracker } from '../lib/tracker.jsx'
import { api } from '../lib/api.js'
import { dur, DAYS, fmtDate } from '../lib/date.js'
import { subjectStats, classesOn, attendanceBudget, weeklyGoalHours, slotRange } from '../lib/stats.js'

export function emptySubject(n = 0) {
  return {
    id: uid('sub'), name: '', code: '', professor: '', credits: 6,
    color: PALETTE[n % PALETTE.length], portalUrl: '', isProgramming: false,
    repoPath: '', folder: '', schedule: [],
    /** 0 = calcularlo a partir de los créditos. */
    weeklyGoalHours: 0,
    /** null = usar el mínimo general de Ajustes. */
    attendanceMin: null,
  }
}

export default function Uni() {
  const { db, toast } = useStore()
  const { start } = useTracker()
  const [form, setForm] = useState(null)
  const hoy = classesOn(db)

  const work = (s, e) => {
    e.preventDefault()
    e.stopPropagation()
    start({ area: 'uni', refId: s.id, taskId: null, label: s.name })
    toast(`Contando tiempo en ${s.name}`)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Universidad · {db.profile?.course}</div>
          <h2>Asignaturas</h2>
          <p>Cada asignatura tiene su carpeta real en el disco, su asistencia y su horario.</p>
        </div>
        <div className="row">
          {db.settings.portalUrl && (
            <button className="btn" onClick={() => api.openUrl(db.settings.portalUrl)}>
              <Icon name="external" size={13} /> {db.settings.portalName || 'Portal'}
            </button>
          )}
          <button className="btn primary" onClick={() => setForm(emptySubject(db.subjects.length))}>
            <Icon name="plus" size={13} /> Asignatura
          </button>
        </div>
      </div>

      {hoy.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-head"><h3>Hoy tienes</h3></div>
          <div className="row wrap" style={{ gap: 6 }}>
            {hoy.map(({ subject, slot }, i) => (
              <a key={i} className="chip" href={`#/uni/${subject.id}`}>
                <span className="dot" style={{ background: subject.color }} />
                {subject.name} <span className="mono dim">{slot.start}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {db.subjects.length === 0 ? (
        <div className="empty">
          <div className="display">Todavía no hay asignaturas</div>
          <p style={{ maxWidth: '46ch', margin: '0 auto 16px' }}>
            Añade las del curso que viene. Se creará una carpeta para cada una dentro de
            tu directorio de trabajo y podrás guardar ahí apuntes, PDFs y entregas.
          </p>
          <button className="btn primary" onClick={() => setForm(emptySubject())}>
            <Icon name="plus" size={13} /> Añadir la primera
          </button>
        </div>
      ) : (
        <div className="sub-grid">
          {db.subjects.map((s) => {
            const st = subjectStats(db, s.id)
            const b = attendanceBudget(db, s.id)
            return (
              <a key={s.id} className="sub-card" href={`#/uni/${s.id}`} style={{ '--c': s.color, display: 'block', textDecoration: 'none' }}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4>{s.name}</h4>
                    <div className="dim mono" style={{ fontSize: 11 }}>
                      {s.code || '—'}{s.credits ? ` · ${s.credits} ECTS` : ''}
                    </div>
                  </div>
                  {s.isProgramming && <span className="badge"><Icon name="code" size={10} /></span>}
                  <button className="btn sm ghost icon" title={`Empezar a contar tiempo en ${s.name}`} onClick={(e) => work(s, e)}>
                    <Icon name="play" size={11} fill="currentColor" />
                  </button>
                </div>

                <div className="row" style={{ gap: 16, marginTop: 14 }}>
                  <div>
                    <div className="num" style={{ fontSize: 22 }}>
                      {st.rate === null ? '—' : `${Math.round(st.rate * 100)}%`}
                    </div>
                    <div className="eyebrow">asistencia</div>
                  </div>
                  <div>
                    <div className="num" style={{ fontSize: 22 }}>{(st.seconds / 3600).toFixed(1)}h</div>
                    <div className="eyebrow">dedicadas</div>
                  </div>
                  <div>
                    <div className="num" style={{ fontSize: 22, color: st.open.length ? 'var(--accent)' : '' }}>{st.open.length}</div>
                    <div className="eyebrow">pendientes</div>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                    <span className="eyebrow">semana</span>
                    <div className="spacer" />
                    <span className="mono" style={{ fontSize: 11, fontWeight: 600 }}>{st.week.pct}%</span>
                  </div>
                  <div className="meter">
                    <i style={{ width: `${Math.min(100, st.week.pct)}%`, background: st.week.pct >= 100 ? 'var(--green)' : s.color }} />
                  </div>
                </div>

                <div className="row wrap" style={{ gap: 4, marginTop: 12 }}>
                  {b.totalCounted > 0 && (
                    <span className={`badge${b.left === 0 || b.doomed ? ' hot' : ''}`} title={`Puedes faltar a ${b.maxAbsences} de ${b.totalCounted} clases`}>
                      {b.doomed ? 'sin margen' : `${b.left} faltas de margen`}
                    </span>
                  )}
                  {st.nextExam && <span className="badge">{st.nextExam.title} · {fmtDate(st.nextExam.date)}</span>}
                  {(s.schedule || []).map((sl, i) => (
                    <span key={i} className="badge">{DAYS[sl.day]} {sl.start}</span>
                  ))}
                </div>
              </a>
            )
          })}
        </div>
      )}

      {form && <SubjectForm subject={form} onClose={() => setForm(null)} />}
    </>
  )
}

export function SubjectForm({ subject, onClose }) {
  const { db, update, toast } = useStore()
  const [s, setS] = useState(subject)
  const exists = db.subjects.some((x) => x.id === s.id)
  const set = (p) => setS((x) => ({ ...x, ...p }))

  const save = async () => {
    if (!s.name.trim()) return toast('La asignatura necesita un nombre', 'err')
    const folder = s.folder || `Universidad/${slug(s.name)}`
    try { await api.mkdir(folder) } catch (e) { toast(e.message, 'err') }
    update((d) => {
      const i = d.subjects.findIndex((x) => x.id === s.id)
      const val = { ...s, folder }
      if (i >= 0) d.subjects[i] = val
      else d.subjects.push(val)
    })
    toast(exists ? 'Asignatura actualizada' : `Carpeta creada en ${folder}`)
    onClose()
  }

  const remove = () => {
    if (!confirm('¿Eliminar la asignatura? Se borran también sus exámenes y su asistencia.\n\nLas tareas y el tiempo registrado se quedan, y su carpeta y sus archivos NO se borran del disco.')) return
    update((d) => {
      d.subjects = d.subjects.filter((x) => x.id !== s.id)
      d.attendance = d.attendance.filter((a) => a.subjectId !== s.id)
      // Un examen es DE una asignatura: sin ella no significa nada, y se quedaba
      // saliendo en el calendario y en inicio como examen de un «?». Las tareas
      // y las horas sí se quedan: una tarea es tuya aunque la asignatura ya no
      // esté, y borrar tiempo que de verdad trabajaste sería peor que dejarlo.
      d.exams = (d.exams || []).filter((e) => e.subjectId !== s.id)
    })
    location.hash = '#/uni'
    onClose()
  }

  // Una clase nueva hereda las fechas del curso: es lo normal y se puede acortar.
  const addSlot = () =>
    set({
      schedule: [
        ...(s.schedule || []),
        { day: 0, start: '09:00', end: '11:00', room: '', from: db.settings.termStart || '', until: db.settings.termEnd || '' },
      ],
    })
  const setSlot = (i, p) => set({ schedule: s.schedule.map((x, j) => (j === i ? { ...x, ...p } : x)) })

  const endless = (s.schedule || []).some((sl) => !slotRange(sl, db.settings).until)

  return (
    <Modal
      title={exists ? 'Editar asignatura' : 'Nueva asignatura'}
      onClose={onClose}
      foot={
        <>
          {exists && <button className="btn ghost danger" onClick={remove}><Icon name="trash" size={13} /> Eliminar</button>}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={save}>Guardar</button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          <label>Nombre</label>
          <input className="input" autoFocus value={s.name} placeholder="Programación Orientada a Objetos" onChange={(e) => set({ name: e.target.value })} />
        </div>

        <div className="grid-3">
          <div className="field"><label>Código</label><input className="input" value={s.code} onChange={(e) => set({ code: e.target.value })} /></div>
          <div className="field"><label>ECTS</label><input className="input" type="number" value={s.credits} onChange={(e) => set({ credits: Number(e.target.value) })} /></div>
          <div className="field"><label>Profesor</label><input className="input" value={s.professor} onChange={(e) => set({ professor: e.target.value })} /></div>
        </div>

        <div className="field">
          <label>Color</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => set({ color: c })}
                style={{
                  width: 22, height: 22, borderRadius: 4, background: c,
                  outline: s.color === c ? '2px solid var(--ink)' : 'none', outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <label>Enlace del campus / aula virtual</label>
          <input className="input" value={s.portalUrl} placeholder="https://campusvirtual…" onChange={(e) => set({ portalUrl: e.target.value })} />
        </div>

        <div className="card flat" style={{ padding: 0 }}>
          <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={s.isProgramming} onChange={(e) => set({ isProgramming: e.target.checked })} />
            <span style={{ fontSize: 13 }}>Es una asignatura de programación</span>
          </label>
          {s.isProgramming && (
            <div className="field" style={{ marginTop: 10 }}>
              <label>Carpeta de código (relativa a tu directorio de prolife)</label>
              <input className="input" value={s.repoPath} placeholder={`Universidad/${slug(s.name || 'asignatura')}/codigo`} onChange={(e) => set({ repoPath: e.target.value })} />
              <span className="dim" style={{ fontSize: 11 }}>Se abrirá en VS Code con un botón desde la asignatura.</span>
            </div>
          )}
        </div>

        <div className="grid-2">
          <div className="field">
            <label>Horas de trabajo por semana</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.5"
              placeholder={String(weeklyGoalHours(db, { ...s, weeklyGoalHours: 0 }))}
              value={s.weeklyGoalHours || ''}
              onChange={(e) => set({ weeklyGoalHours: Number(e.target.value) || 0 })}
            />
            <span className="dim" style={{ fontSize: 11 }}>
              Es el 100% de esta asignatura. Vacío = calculado por créditos ({weeklyGoalHours(db, { ...s, weeklyGoalHours: 0 })} h).
            </span>
          </div>
          <div className="field">
            <label>Asistencia mínima exigida (%)</label>
            <input
              className="input"
              type="number"
              min="0"
              max="100"
              placeholder={String(Math.round((db.settings.attendanceMin ?? 0.7) * 100))}
              value={s.attendanceMin == null ? '' : Math.round(s.attendanceMin * 100)}
              onChange={(e) => set({ attendanceMin: e.target.value === '' ? null : Number(e.target.value) / 100 })}
            />
            <span className="dim" style={{ fontSize: 11 }}>Vacío = el general de Ajustes. De aquí sale cuántas faltas te quedan.</span>
          </div>
        </div>

        <div>
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="eyebrow">Horario semanal</span>
            <div className="spacer" />
            <button className="btn sm ghost" onClick={addSlot}><Icon name="plus" size={12} /> Añadir clase</button>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            {(s.schedule || []).map((sl, i) => (
              <div key={i} className="card flat" style={{ padding: 10 }}>
                <div className="row" style={{ gap: 6 }}>
                  <select className="select" style={{ width: 96 }} value={sl.day} onChange={(e) => setSlot(i, { day: Number(e.target.value) })}>
                    {DAYS.map((d, j) => <option key={j} value={j}>{d}</option>)}
                  </select>
                  <input className="input" style={{ width: 92 }} type="time" value={sl.start} onChange={(e) => setSlot(i, { start: e.target.value })} />
                  <input className="input" style={{ width: 92 }} type="time" value={sl.end} onChange={(e) => setSlot(i, { end: e.target.value })} />
                  <input className="input" placeholder="Aula" value={sl.room} onChange={(e) => setSlot(i, { room: e.target.value })} />
                  <button className="btn ghost icon" onClick={() => set({ schedule: s.schedule.filter((_, j) => j !== i) })}><Icon name="x" size={13} /></button>
                </div>
                <div className="row" style={{ gap: 6, marginTop: 7 }}>
                  <span className="dim" style={{ fontSize: 11.5, width: 96 }}>Desde</span>
                  <input className="input" style={{ width: 148 }} type="date" value={sl.from || ''} onChange={(e) => setSlot(i, { from: e.target.value })} />
                  <span className="dim" style={{ fontSize: 11.5 }}>hasta</span>
                  <input className="input" style={{ width: 148 }} type="date" value={sl.until || ''} onChange={(e) => setSlot(i, { until: e.target.value })} />
                  <div className="spacer" />
                  {!sl.until && (
                    <span className="badge hot" title="Sin fecha de fin la clase se repite para siempre">no acaba nunca</span>
                  )}
                </div>
              </div>
            ))}
            {(s.schedule || []).length === 0 && (
              <p className="dim" style={{ fontSize: 12, margin: 0 }}>Sin clases fijas. El horario alimenta el calendario y la asistencia.</p>
            )}
          </div>
          <p className="dim" style={{ fontSize: 11.5, margin: '10px 0 0', lineHeight: 1.55 }}>
            {endless
              ? 'Una clase sin fecha de fin se agenda hasta el fin de los tiempos y no deja calcular cuántas faltas te puedes permitir. Pon el fin del cuatrimestre.'
              : 'Cada clase vale solo entre esas dos fechas. Vacío = las del curso, que se ponen en Ajustes.'}
          </p>
        </div>
      </div>
    </Modal>
  )
}

export { dur }
