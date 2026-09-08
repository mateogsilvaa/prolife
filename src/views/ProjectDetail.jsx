import React, { useState } from 'react'
import Icon from '../components/Icon.jsx'
import TaskList from '../components/TaskList.jsx'
import TaskEditor, { newTask } from '../components/TaskEditor.jsx'
import LogTime from '../components/LogTime.jsx'
import { ProjectForm, projectStats } from './Work.jsx'
import { useStore, refLabel } from '../lib/store.jsx'
import { api } from '../lib/api.js'
import { dur, fmtDate, iso, addDays, startOfWeek, parseIso } from '../lib/date.js'

export default function ProjectDetail({ id }) {
  const { db, toast } = useStore()
  const [tab, setTab] = useState('tareas')
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(null)

  const p = db.projects.find((x) => x.id === id)
  if (!p) return <div className="empty"><div className="display">Ese proyecto ya no existe</div><a className="btn" href="#/trabajo">Volver</a></div>

  const st = projectStats(db, p.id)
  const tasks = db.tasks.filter((t) => t.refId === p.id)
  const last = db.sessions.filter((s) => s.refId === p.id).slice(-10).reverse()

  const weeks = []
  for (let i = 7; i >= 0; i--) {
    const start = iso(addDays(startOfWeek(new Date()), -7 * i))
    const end = iso(addDays(parseIso(start), 6))
    weeks.push(db.sessions.filter((s) => s.refId === p.id && s.date >= start && s.date <= end).reduce((a, s) => a + s.seconds, 0))
  }
  const maxWeek = Math.max(...weeks, 1)

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <a className="btn sm ghost" href="#/trabajo"><Icon name="chevronL" size={13} /> Trabajo</a>
      </div>

      <div className="page-head">
        <div>
          <div className="eyebrow row" style={{ gap: 6 }}><span className="dot" style={{ background: p.color }} />{p.org || 'Proyecto'}</div>
          <h2>{p.name}</h2>
        </div>
        <div className="row">
          <a className="btn primary" href={`#/espacio/trabajo/${p.id}`}><Icon name="layers" size={13} /> Abrir espacio de trabajo</a>
          <LogTime area="work" refId={p.id} label={p.name} />
          <button className="btn" onClick={() => api.openInCode(p.folder).then(() => toast('Abriendo VS Code…')).catch((e) => toast(e.message, 'err'))}>
            <Icon name="code" size={13} /> VS Code
          </button>
          <button className="btn ghost" onClick={() => setEditing(true)}><Icon name="settings" size={13} /></button>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 22 }}>
        <div className="stat">
          <div className="eyebrow">Esta semana</div>
          <div className="value num">{(st.week / 3600).toFixed(1)}<span>h</span></div>
          <div className="delta dim">aproximación medida sola</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Este mes</div>
          <div className="value num">{(st.month / 3600).toFixed(1)}<span>h</span></div>
          <div className="delta dim">{st.open.length} tareas abiertas</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Total acumulado</div>
          <div className="value num">{(st.total / 3600).toFixed(1)}<span>h</span></div>
          <div className="delta dim">desde que existe el proyecto</div>
        </div>
      </div>

      <div className="tabs">
        {[['tareas', `Tareas (${st.open.length})`], ['horas', 'Registro de horas']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'tareas' && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="spacer" />
            <button className="btn sm" onClick={() => setAdding(newTask({ area: 'work', refId: p.id }))}><Icon name="plus" size={12} /> Nueva tarea</button>
          </div>
          <TaskList
            tasks={[...tasks].sort((a, b) => (a.status === 'done') - (b.status === 'done'))}
            showArea={false}
            onQuickAdd={() => setAdding(newTask({ area: 'work', refId: p.id }))}
          />
        </>
      )}

      {tab === 'horas' && (
        <div className="split even">
          <div className="card">
            <div className="card-head"><h3>Horas por semana</h3></div>
            <div className="bars">
              {weeks.map((v, i) => (
                <div className="col" key={i} title={dur(v)}>
                  <div className="seg-bar" style={{ height: `${(v / maxWeek) * 100}%`, background: i === weeks.length - 1 ? p.color : 'var(--line-strong)' }} />
                </div>
              ))}
            </div>
            <div className="axis">{weeks.map((_, i) => <span key={i}>{i === weeks.length - 1 ? 'ahora' : `-${weeks.length - 1 - i}`}</span>)}</div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Últimas sesiones</h3></div>
            {last.length ? (
              <div className="list">
                {last.map((s) => (
                  <div key={s.id} className="list-row">
                    <span style={{ width: 84 }} className="dim">{fmtDate(s.date)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>{refLabel(db, s)}</span>
                    <span className="badge">{s.source === 'auto' ? 'detectado' : s.source === 'manual' ? 'a mano' : 'corregido'}</span>
                    <span className="mono">{dur(s.seconds)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Sin sesiones registradas.</p>}
          </div>
        </div>
      )}

      {editing && <ProjectForm project={p} onClose={() => setEditing(false)} />}
      {adding && <TaskEditor task={adding} onClose={() => setAdding(null)} />}
    </>
  )
}
