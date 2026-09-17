import React, { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import TaskList from '../components/TaskList.jsx'
import TaskEditor, { newTask } from '../components/TaskEditor.jsx'
import { useStore, AREAS } from '../lib/store.jsx'
import { daysUntil, today, fmtDate } from '../lib/date.js'

const GROUPS = [
  { id: 'atrasadas', label: 'Atrasadas', test: (t) => t.due && daysUntil(t.due) < 0 },
  { id: 'hoy', label: 'Hoy', test: (t) => t.due && daysUntil(t.due) === 0 },
  { id: 'semana', label: 'Próximos 7 días', test: (t) => t.due && daysUntil(t.due) > 0 && daysUntil(t.due) <= 7 },
  { id: 'despues', label: 'Más adelante', test: (t) => t.due && daysUntil(t.due) > 7 },
  { id: 'sinfecha', label: 'Sin fecha', test: (t) => !t.due },
]

export default function Tasks() {
  const { db } = useStore()
  const [area, setArea] = useState('all')
  const [q, setQ] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [adding, setAdding] = useState(null)

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return db.tasks.filter(
      (t) =>
        (area === 'all' || t.area === area) &&
        (showDone || t.status !== 'done') &&
        (!term || t.title.toLowerCase().includes(term) || (t.notes || '').toLowerCase().includes(term))
    )
  }, [db.tasks, area, q, showDone])

  const open = filtered.filter((t) => t.status !== 'done')
  const done = filtered.filter((t) => t.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Quehaceres</div>
          <h2>Tareas</h2>
          <p>{open.length} abiertas · {db.tasks.filter((t) => t.status === 'done').length} completadas en total</p>
        </div>
        <button className="btn primary" onClick={() => setAdding(newTask({ area: area === 'all' ? 'uni' : area }))}>
          <Icon name="plus" size={13} /> Nueva tarea
        </button>
      </div>

      <div className="row wrap" style={{ marginBottom: 20, gap: 8 }}>
        <div className="row buscador">
          <Icon name="search" size={14} style={{ position: 'absolute', left: 10, color: 'var(--ink-3)' }} />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="seg">
          <button className={area === 'all' ? 'on' : ''} onClick={() => setArea('all')}>Todo</button>
          {Object.entries(AREAS).map(([k, v]) => (
            <button key={k} className={area === k ? 'on' : ''} onClick={() => setArea(k)}>{v.label}</button>
          ))}
        </div>
        <div className="spacer" />
        <button className={`chip${showDone ? ' on' : ''}`} onClick={() => setShowDone(!showDone)}>
          <Icon name="check" size={11} /> Ver completadas
        </button>
      </div>

      <div className="stack" style={{ gap: 18 }}>
        {GROUPS.map((g) => {
          const list = open
            .filter(g.test)
            .sort((a, b) => b.priority - a.priority || (a.due || 'z').localeCompare(b.due || 'z'))
          if (!list.length) return null
          return (
            <div className="card" key={g.id}>
              <div className="card-head">
                <h3 style={{ color: g.id === 'atrasadas' ? 'var(--accent)' : '' }}>{g.label}</h3>
                <span className="badge">{list.length}</span>
              </div>
              <TaskList tasks={list} />
            </div>
          )
        })}

        {open.length === 0 && (
          <div className="empty">
            <div className="display">Cero pendientes</div>
            <p>Nada que hacer en este filtro. Disfrútalo.</p>
          </div>
        )}

        {showDone && done.length > 0 && (
          <div className="card">
            <div className="card-head"><h3 className="dim">Completadas</h3><span className="badge">{done.length}</span></div>
            <TaskList tasks={done.slice(0, 40)} />
          </div>
        )}
      </div>

      {adding && <TaskEditor task={adding} onClose={() => setAdding(null)} />}
    </>
  )
}
