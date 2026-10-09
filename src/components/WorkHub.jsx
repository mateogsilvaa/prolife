import React, { useMemo, useState } from 'react'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import { ProjectForm, emptyProject, projectStats } from '../views/Work.jsx'
import { newTask } from './TaskEditor.jsx'
import { useStore, uid } from '../lib/store.jsx'
import { today, iso, addDays, startOfWeek, parseIso, fmtDate, daysUntil, DAYS, dur } from '../lib/date.js'

/**
 * Trabajo: lo que de verdad sirve llevar de un trabajo que empieza.
 *
 * - **Diario**: qué hiciste cada día, en dos líneas. Es lo que luego permite
 *   contestar «¿qué hice la semana pasada?» o preparar una reunión.
 * - **Metas**: a dónde quieres llegar, con sus pasos y fecha.
 * - **Ideas y notas**: lo que se te ocurre, para no perderlo; una idea se
 *   convierte en tarea con un toque.
 * - **Proyectos**: lo de siempre, en pequeño.
 *
 * Todo en una pantalla, cada bloque con su propio scroll, para no tener que
 * bajar para ver lo segundo.
 */
export default function WorkHub() {
  const { db } = useStore()
  const [proyecto, setProyecto] = useState(null)
  const log = db.workLog || []
  const metas = db.workGoals || []
  const notas = db.workNotes || []

  const lunes = startOfWeek(new Date())
  const semana = Array.from({ length: 7 }, (_, i) => iso(addDays(lunes, i)))
  const conRegistro = new Set(log.map((e) => e.date))
  const racha = (() => {
    let n = 0
    for (let i = conRegistro.has(today()) ? 0 : 1; i < 400; i++) {
      const d = iso(addDays(new Date(), -i))
      if (conRegistro.has(d)) n++
      else if (parseIso(d).getDay() % 6 !== 0) break // fin de semana sin registro no corta la racha
    }
    return n
  })()
  const activas = metas.filter((m) => m.status !== 'hecha')
  const proxima = activas.filter((m) => m.due).sort((a, b) => a.due.localeCompare(b.due))[0]
  const horasSemana = db.sessions.filter((x) => x.area === 'work' && x.date >= semana[0]).reduce((a, x) => a + x.seconds, 0)

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Trabajo{db.settings.orgName ? ` · ${db.settings.orgName}` : ''}</div>
          <h2>Trabajo</h2>
        </div>
        <button className="btn" onClick={() => setProyecto(emptyProject(db.projects.length, db.settings.orgName))}>
          <Icon name="plus" size={13} /> Proyecto
        </button>
      </div>

      <div className="grid-4" style={{ marginBottom: 12 }}>
        <div className="stat">
          <div className="eyebrow">Diario esta semana</div>
          <div className="row" style={{ gap: 4, marginTop: 6 }}>
            {semana.map((d, i) => (
              <div key={d} title={d} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: 8, borderRadius: 4, background: conRegistro.has(d) ? 'var(--accent)' : d > today() ? 'var(--line)' : 'var(--line-strong)' }} />
                <div className="dim" style={{ fontSize: 9.5, marginTop: 3 }}>{DAYS[i][0]}</div>
              </div>
            ))}
          </div>
          <div className="delta dim">{racha > 1 ? `racha de ${racha} días` : 'apunta algo cada día'}</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Metas activas</div>
          <div className="value num">{activas.length}</div>
          <div className="delta dim">{proxima ? `${proxima.title} · ${fmtDate(proxima.due)}` : 'sin fechas próximas'}</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Ideas por mirar</div>
          <div className="value num">{notas.filter((n) => n.kind === 'idea' && !n.done).length}</div>
          <div className="delta dim">{notas.filter((n) => n.kind === 'nota').length} notas guardadas</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Horas esta semana</div>
          <div className="value num">{(horasSemana / 3600).toFixed(1)}<span>h</span></div>
          <div className="delta dim">{log.filter((e) => e.date >= semana[0]).length} entradas en el diario</div>
        </div>
      </div>

      <div className="hoy-grid">
        <Diario />
        <div className="stack">
          <Metas />
          <Proyectos onEdit={setProyecto} />
        </div>
        <div className="stack hoy-col-3">
          <Notas />
        </div>
      </div>

      {proyecto && <ProjectForm project={proyecto} onClose={() => setProyecto(null)} />}
    </>
  )
}

/* ------------------------------------------------------------------ diario */

function Diario() {
  const { db, update } = useStore()
  const [texto, setTexto] = useState('')
  const [fecha, setFecha] = useState(today())
  const [proj, setProj] = useState('')
  const [editando, setEditando] = useState(null)
  const [q, setQ] = useState('')
  const log = db.workLog || []

  const porDia = useMemo(() => {
    const term = q.trim().toLowerCase()
    const m = new Map()
    for (const e of [...log].filter((x) => !term || x.text.toLowerCase().includes(term)).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0))) {
      m.set(e.date, [...(m.get(e.date) || []), e])
    }
    return [...m.entries()]
  }, [log, q])

  const guardar = () => {
    if (!texto.trim()) return
    update((d) => {
      d.workLog ||= []
      d.workLog.push({ id: uid('wl'), date: fecha, text: texto.trim(), projectId: proj || null, createdAt: Date.now() })
    })
    setTexto('')
  }

  const nombreProyecto = (id) => db.projects.find((p) => p.id === id)

  return (
    <div className="card">
      <div className="card-head">
        <h3>Diario</h3>
        <input className="input" style={{ maxWidth: 150, padding: '4px 8px', fontSize: 12 }} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <textarea className="textarea" style={{ minHeight: 64 }} placeholder="¿Qué has hecho hoy? Avances, reuniones, problemas, lo que queda pendiente…"
        value={texto} onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) guardar() }} />
      <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
        <input className="input" type="date" style={{ maxWidth: 150, padding: '4px 8px' }} value={fecha} onChange={(e) => setFecha(e.target.value || today())} />
        {db.projects.length > 0 && (
          <select className="select" style={{ maxWidth: 170, padding: '4px 8px' }} value={proj} onChange={(e) => setProj(e.target.value)}>
            <option value="">Sin proyecto</option>
            {db.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <div className="spacer" />
        <button className="btn sm primary" disabled={!texto.trim()} onClick={guardar}>Apuntar <span className="kbd">Ctrl ↵</span></button>
      </div>

      <div className="scroll-box" style={{ maxHeight: '52vh', marginTop: 10 }}>
        {porDia.length ? porDia.map(([d, entradas]) => (
          <div key={d} className="log-day">
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{fmtDate(d)}</div>
              <div className="dim mono" style={{ fontSize: 10.5 }}>{d.slice(5).split('-').reverse().join('/')}</div>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              {entradas.map((e) => {
                const p = nombreProyecto(e.projectId)
                return (
                  <div key={e.id} className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
                    {p && <span className="dot" style={{ background: p.color, marginTop: 6 }} title={p.name} />}
                    <div style={{ flex: 1, fontSize: 13, whiteSpace: 'pre-wrap', cursor: 'pointer' }} onClick={() => setEditando(e)}>{e.text}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )) : (
          <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
            {q ? 'Nada con eso.' : 'Dos líneas al acabar el día bastan: dentro de un mes valdrán oro.'}
          </p>
        )}
      </div>

      {editando && (
        <Modal title={`Diario · ${fmtDate(editando.date)}`} onClose={() => setEditando(null)} foot={
          <>
            <button className="btn ghost danger" onClick={() => { update((d) => { d.workLog = d.workLog.filter((x) => x.id !== editando.id) }); setEditando(null) }}><Icon name="trash" size={13} /> Eliminar</button>
            <div className="spacer" />
            <button className="btn primary" onClick={() => { update((d) => { const x = d.workLog.find((y) => y.id === editando.id); if (x) Object.assign(x, editando) }); setEditando(null) }}>Guardar</button>
          </>
        }>
          <div className="stack">
            <input className="input" type="date" value={editando.date} onChange={(e) => setEditando({ ...editando, date: e.target.value })} />
            <textarea className="textarea" style={{ minHeight: 140 }} value={editando.text} onChange={(e) => setEditando({ ...editando, text: e.target.value })} />
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- metas */

const nuevaMeta = () => ({ id: uid('wg'), title: '', why: '', due: '', status: 'activa', milestones: [], createdAt: Date.now() })

function Metas() {
  const { db, update } = useStore()
  const [meta, setMeta] = useState(null)
  const [verHechas, setVerHechas] = useState(false)
  const metas = (db.workGoals || []).filter((m) => verHechas || m.status !== 'hecha')
    .sort((a, b) => (a.status === 'hecha') - (b.status === 'hecha') || (a.due || 'z').localeCompare(b.due || 'z'))

  const toggleHito = (m, hid) => update((d) => {
    const x = d.workGoals.find((y) => y.id === m.id)
    const h = x?.milestones.find((y) => y.id === hid)
    if (h) h.done = !h.done
  })

  return (
    <div className="card">
      <div className="card-head">
        <h3>Metas</h3>
        <div className="row" style={{ gap: 4 }}>
          {(db.workGoals || []).some((m) => m.status === 'hecha') && (
            <button className={`chip tiny${verHechas ? ' on' : ''}`} onClick={() => setVerHechas(!verHechas)}>hechas</button>
          )}
          <button className="btn sm" onClick={() => setMeta(nuevaMeta())}><Icon name="plus" size={12} /></button>
        </div>
      </div>
      {metas.length ? (
        <div className="stack scroll-box" style={{ gap: 10, maxHeight: 300 }}>
          {metas.map((m) => {
            const total = m.milestones.length
            const hechos = m.milestones.filter((h) => h.done).length
            const pct = m.status === 'hecha' ? 100 : total ? Math.round((hechos / total) * 100) : 0
            const dias = m.due ? daysUntil(m.due) : null
            return (
              <div key={m.id} style={{ opacity: m.status === 'hecha' ? 0.55 : 1 }}>
                <div className="row" style={{ gap: 6, cursor: 'pointer' }} onClick={() => setMeta(m)}>
                  <strong style={{ fontSize: 13, flex: 1 }}>{m.title}</strong>
                  {dias !== null && m.status !== 'hecha' && (
                    <span className="badge" style={{ color: dias < 0 ? 'var(--accent)' : dias <= 7 ? 'var(--amber)' : '' }}>
                      {dias < 0 ? `vencida` : dias === 0 ? 'hoy' : `${dias} d`}
                    </span>
                  )}
                  <span className="mono dim" style={{ fontSize: 11 }}>{pct}%</span>
                </div>
                <div className="meter" style={{ margin: '5px 0' }}><i style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--green)' : 'var(--accent)' }} /></div>
                {m.milestones.slice(0, 4).map((h) => (
                  <label key={h.id} className="row" style={{ gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!h.done} onChange={() => toggleHito(m, h.id)} />
                    <span style={{ textDecoration: h.done ? 'line-through' : 'none', color: h.done ? 'var(--ink-3)' : '' }}>{h.text}</span>
                  </label>
                ))}
                {m.milestones.length > 4 && <div className="dim" style={{ fontSize: 11 }}>+{m.milestones.length - 4} pasos más</div>}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
          Lo que quieres conseguir en este trabajo, partido en pasos. «Llevar yo solo el informe mensual», «aprender la herramienta X»…
        </p>
      )}
      {meta && <MetaForm meta={meta} onClose={() => setMeta(null)} />}
    </div>
  )
}

function MetaForm({ meta, onClose }) {
  const { db, update } = useStore()
  const [m, setM] = useState(() => structuredClone(meta))
  const [paso, setPaso] = useState('')
  const existe = (db.workGoals || []).some((x) => x.id === m.id)
  const guardar = () => {
    if (!m.title.trim()) return
    update((d) => {
      d.workGoals ||= []
      const i = d.workGoals.findIndex((x) => x.id === m.id)
      const v = { ...m, doneAt: m.status === 'hecha' ? m.doneAt || Date.now() : null }
      if (i >= 0) d.workGoals[i] = v
      else d.workGoals.push(v)
    })
    onClose()
  }
  const anadir = () => {
    if (!paso.trim()) return
    setM({ ...m, milestones: [...m.milestones, { id: uid('wh'), text: paso.trim(), done: false }] })
    setPaso('')
  }
  return (
    <Modal title={existe ? 'Meta' : 'Nueva meta'} onClose={onClose} foot={
      <>
        {existe && <button className="btn ghost danger" onClick={() => { update((d) => { d.workGoals = d.workGoals.filter((x) => x.id !== m.id) }); onClose() }}><Icon name="trash" size={13} /> Eliminar</button>}
        <div className="spacer" />
        <button className="btn primary" disabled={!m.title.trim()} onClick={guardar}>Guardar</button>
      </>
    }>
      <div className="stack">
        <div className="field"><label>Qué quieres conseguir</label><input className="input" autoFocus value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} /></div>
        <div className="grid-2">
          <div className="field"><label>Para cuándo</label><input className="input" type="date" value={m.due || ''} onChange={(e) => setM({ ...m, due: e.target.value })} /></div>
          <div className="field">
            <label>Estado</label>
            <div className="row" style={{ gap: 5 }}>
              {['activa', 'pausada', 'hecha'].map((s) => <button key={s} className={`chip${m.status === s ? ' on' : ''}`} onClick={() => setM({ ...m, status: s })}>{s}</button>)}
            </div>
          </div>
        </div>
        <div className="field"><label>Por qué importa</label><textarea className="textarea" value={m.why || ''} onChange={(e) => setM({ ...m, why: e.target.value })} /></div>
        <div className="field">
          <label>Pasos</label>
          {m.milestones.map((h, i) => (
            <div key={h.id} className="row" style={{ gap: 6, marginBottom: 4 }}>
              <input type="checkbox" checked={!!h.done} onChange={() => setM({ ...m, milestones: m.milestones.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} />
              <input className="input" style={{ padding: '4px 8px' }} value={h.text} onChange={(e) => setM({ ...m, milestones: m.milestones.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              <button className="btn ghost icon sm" onClick={() => setM({ ...m, milestones: m.milestones.filter((_, j) => j !== i) })}><Icon name="x" size={10} /></button>
            </div>
          ))}
          <div className="row" style={{ gap: 6 }}>
            <input className="input" style={{ padding: '4px 8px' }} placeholder="Añadir paso…" value={paso} onChange={(e) => setPaso(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') anadir() }} />
            <button className="btn sm" onClick={anadir}><Icon name="plus" size={11} /></button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------- ideas y notas */

function Notas() {
  const { db, update, toast } = useStore()
  const [tipo, setTipo] = useState('idea')
  const [texto, setTexto] = useState('')
  const [filtro, setFiltro] = useState('todo')
  const [abierta, setAbierta] = useState(null)
  const notas = (db.workNotes || [])
    .filter((n) => filtro === 'todo' || n.kind === filtro)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.done ? 1 : 0) - (b.done ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0))

  const guardar = () => {
    const t = texto.trim()
    if (!t) return
    const [titulo, ...resto] = t.split('\n')
    update((d) => {
      d.workNotes ||= []
      d.workNotes.push({ id: uid('wn'), kind: tipo, title: titulo.slice(0, 120), body: resto.join('\n').trim(), pinned: false, done: false, createdAt: Date.now() })
    })
    setTexto('')
  }

  const aTarea = (n) => {
    update((d) => {
      d.tasks.unshift({ ...newTask({ area: 'work', title: n.title }), notes: n.body || '' })
      const x = d.workNotes.find((y) => y.id === n.id)
      if (x) x.done = true
    })
    toast('Convertida en tarea de Trabajo')
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Ideas y notas</h3>
        <div className="seg">
          {[['todo', 'Todo'], ['idea', 'Ideas'], ['nota', 'Notas']].map(([k, l]) => <button key={k} className={filtro === k ? 'on' : ''} onClick={() => setFiltro(k)}>{l}</button>)}
        </div>
      </div>
      <div className="row" style={{ gap: 4, marginBottom: 6 }}>
        <button className={`chip tiny${tipo === 'idea' ? ' on' : ''}`} onClick={() => setTipo('idea')}>Idea</button>
        <button className={`chip tiny${tipo === 'nota' ? ' on' : ''}`} onClick={() => setTipo('nota')}>Nota</button>
      </div>
      <textarea className="textarea" style={{ minHeight: 54 }} placeholder={tipo === 'idea' ? 'Una idea: la primera línea es el título' : 'Una nota: contraseñas no, procedimientos sí'}
        value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) guardar() }} />
      <button className="btn sm" style={{ marginTop: 6 }} disabled={!texto.trim()} onClick={guardar}><Icon name="plus" size={11} /> Guardar</button>

      <div className="stack scroll-box" style={{ gap: 8, marginTop: 10, maxHeight: '50vh' }}>
        {notas.map((n) => (
          <div key={n.id} className={`note-card ${n.kind}`} style={{ opacity: n.done ? 0.5 : 1 }}>
            <div className="row" style={{ gap: 6 }}>
              <strong style={{ fontSize: 13, flex: 1, cursor: 'pointer', textDecoration: n.done ? 'line-through' : 'none' }} onClick={() => setAbierta(n)}>{n.title}</strong>
              <button className="btn ghost icon sm" title={n.pinned ? 'Desfijar' : 'Fijar arriba'} onClick={() => update((d) => { const x = d.workNotes.find((y) => y.id === n.id); if (x) x.pinned = !x.pinned })}>
                <Icon name="pin" size={11} style={{ opacity: n.pinned ? 1 : 0.35 }} />
              </button>
            </div>
            {n.body && <div className="dim" style={{ fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>{n.body}</div>}
            <div className="row" style={{ gap: 6 }}>
              <span className="dim" style={{ fontSize: 10.5 }}>{n.kind} · {fmtDate(iso(new Date(n.createdAt)))}</span>
              <div className="spacer" />
              {n.kind === 'idea' && !n.done && <button className="btn sm ghost" onClick={() => aTarea(n)}>→ tarea</button>}
            </div>
          </div>
        ))}
        {!notas.length && <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Nada todavía.</p>}
      </div>

      {abierta && (
        <Modal title={abierta.kind === 'idea' ? 'Idea' : 'Nota'} onClose={() => setAbierta(null)} foot={
          <>
            <button className="btn ghost danger" onClick={() => { update((d) => { d.workNotes = d.workNotes.filter((x) => x.id !== abierta.id) }); setAbierta(null) }}><Icon name="trash" size={13} /> Eliminar</button>
            <button className="btn ghost" onClick={() => setAbierta({ ...abierta, done: !abierta.done })}>{abierta.done ? 'Reabrir' : 'Hecha / descartada'}</button>
            <div className="spacer" />
            <button className="btn primary" onClick={() => { update((d) => { const x = d.workNotes.find((y) => y.id === abierta.id); if (x) Object.assign(x, abierta) }); setAbierta(null) }}>Guardar</button>
          </>
        }>
          <div className="stack">
            <input className="input" value={abierta.title} onChange={(e) => setAbierta({ ...abierta, title: e.target.value })} />
            <textarea className="textarea" style={{ minHeight: 160 }} value={abierta.body || ''} onChange={(e) => setAbierta({ ...abierta, body: e.target.value })} />
          </div>
        </Modal>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- proyectos */

function Proyectos({ onEdit }) {
  const { db } = useStore()
  return (
    <div className="card">
      <div className="card-head"><h3>Proyectos</h3><button className="btn sm" onClick={() => onEdit(emptyProject(db.projects.length, db.settings.orgName))}><Icon name="plus" size={12} /></button></div>
      {db.projects.length ? (
        <div className="list">
          {db.projects.map((p) => {
            const st = projectStats(db, p.id)
            const ultima = [...(db.workLog || [])].filter((e) => e.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date))[0]
            return (
              <a key={p.id} className="list-row click" href={`#/trabajo/${p.id}`} style={{ textDecoration: 'none' }}>
                <span className="dot" style={{ background: p.color }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>{p.name}</div>
                  <div className="dim" style={{ fontSize: 11 }}>{ultima ? `diario: ${fmtDate(ultima.date)}` : p.org || '—'}{st.open.length ? ` · ${st.open.length} pendientes` : ''}</div>
                </div>
                <span className="mono dim" style={{ fontSize: 11 }}>{dur(st.week)}</span>
              </a>
            )
          })}
        </div>
      ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Cada línea de trabajo, con su carpeta y su tiempo.</p>}
    </div>
  )
}
