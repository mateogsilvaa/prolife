import React, { useState } from 'react'
import Icon from './Icon.jsx'
import TaskEditor, { PRIORITIES, newTask } from './TaskEditor.jsx'
import { useStore, AREAS, refLabel } from '../lib/store.jsx'
import { fmtDate, daysUntil, dur } from '../lib/date.js'

export default function TaskList({ tasks, empty = 'Nada pendiente por aquí.', showArea = true, onQuickAdd }) {
  const { db, applyChange } = useStore()
  const [editing, setEditing] = useState(null)

  /**
   * Tachar va por `applyChange` y no por `update`: es de las tres cosas que se
   * pueden apuntar sin el ordenador delante, porque tocan un solo registro y se
   * pueden aplicar luego sobre la base de ese momento sin machacar nada.
   */
  const toggle = (t) => {
    const status = t.status === 'done' ? 'todo' : 'done'
    applyChange({ kind: 'tarea', taskId: t.id, status, doneAt: status === 'done' ? Date.now() : null })
  }

  if (!tasks.length) {
    return (
      <div className="empty">
        <div className="display">{empty}</div>
        {onQuickAdd && <button className="btn sm" style={{ marginTop: 10 }} onClick={onQuickAdd}><Icon name="plus" size={12} /> Añadir tarea</button>}
      </div>
    )
  }

  return (
    <>
      <div className="list">
        {tasks.map((t) => {
          const done = t.status === 'done'
          const days = t.due ? daysUntil(t.due) : null
          const spent = db.sessions.filter((s) => s.taskId === t.id).reduce((a, s) => a + s.seconds, 0)
          const prio = PRIORITIES.find((p) => p.id === t.priority) || PRIORITIES[2]
          return (
            <div key={t.id} className={`task${done ? ' done' : ''}`}>
              <button className={`check${done ? ' on' : ''}`} onClick={() => toggle(t)} title="Completar" />
              {!done && t.priority >= 2 && <span className="prio" style={{ background: prio.color }} />}
              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setEditing(t)}>
                <div className="task-title">{t.title}</div>
                <div className="task-meta">
                  {showArea && (
                    <span className="row" style={{ gap: 4 }}>
                      <span className="dot" style={{ background: AREAS[t.area]?.color, width: 5, height: 5 }} />
                      {refLabel(db, { area: t.area, refId: t.refId, label: AREAS[t.area]?.label })}
                    </span>
                  )}
                  {t.due && <span className={!done && days <= 0 ? 'overdue' : ''}>· {fmtDate(t.due)}</span>}
                  {t.estimate > 0 && <span>· est. {dur(t.estimate * 60)}</span>}
                  {spent > 0 && <span className="mono">· {dur(spent)}</span>}
                </div>
              </div>
              <div className="task-actions">
                {!done && (
                  <a className="btn ghost icon" href={`#/espacio/tarea/${t.id}`} title="Abrir espacio de trabajo">
                    <Icon name="layers" size={12} />
                  </a>
                )}
                <button className="btn ghost icon" title="Editar" onClick={() => setEditing(t)}><Icon name="edit" size={12} /></button>
              </div>
            </div>
          )
        })}
      </div>
      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

export { newTask }
