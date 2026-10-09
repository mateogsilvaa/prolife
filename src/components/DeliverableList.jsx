import React, { useState } from 'react'
import ExamEditor, { kindLabel } from './ExamEditor.jsx'
import { useStore } from '../lib/store.jsx'
import { fmtDate, daysUntil } from '../lib/date.js'

/**
 * Prácticas y entregas evaluables con la misma pinta que una tarea: casilla
 * para marcarla como entregada, asignatura, peso y fecha.
 *
 * Se apuntan una vez, en la asignatura o en el calendario, y salen aquí solas.
 * Marcarla aquí la marca allí: es el mismo registro, no una copia.
 */
export default function DeliverableList({ items }) {
  const { update } = useStore()
  const [open, setOpen] = useState(null)

  const toggle = (e) =>
    update((d) => {
      const x = (d.exams || []).find((y) => y.id === e.id)
      if (!x) return
      x.delivered = !x.delivered
      x.deliveredAt = x.delivered ? Date.now() : null
    })

  return (
    <>
      <div className="list">
        {items.map((e) => {
          const days = daysUntil(e.date)
          return (
            <div key={e.id} className={`task${e.delivered ? ' done' : ''}`}>
              <button className={`check${e.delivered ? ' on' : ''}`} onClick={() => toggle(e)} title={e.delivered ? 'Desmarcar' : 'Marcar como entregada'} />
              <span className="prio" style={{ background: e.subject?.color || 'var(--accent)' }} />
              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setOpen(e)}>
                <div className="task-title">{e.title}</div>
                <div className="task-meta">
                  <span className="row" style={{ gap: 4 }}>
                    <span className="dot" style={{ background: e.subject?.color, width: 5, height: 5 }} />
                    {e.subject?.name || 'Sin asignatura'}
                  </span>
                  <span>· {kindLabel(e.kind)}</span>
                  {e.weight > 0 && <span>· {e.weight}% de la nota</span>}
                  <span className={!e.delivered && days <= 0 ? 'overdue' : ''}>
                    · {fmtDate(e.date)}{e.start ? ` ${e.start}` : ''}
                    {!e.delivered && days > 1 && days <= 14 ? ` (${days} días)` : ''}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {open && <ExamEditor exam={open} onClose={() => setOpen(null)} />}
    </>
  )
}
