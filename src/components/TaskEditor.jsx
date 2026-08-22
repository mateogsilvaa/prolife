import React, { useState } from 'react'
import Modal from './Modal.jsx'
import Icon from './Icon.jsx'
import { useStore, AREAS, uid, slug } from '../lib/store.jsx'
import { today, dur } from '../lib/date.js'
import { api } from '../lib/api.js'

export const PRIORITIES = [
  { id: 3, label: 'Urgente', color: 'var(--accent)' },
  { id: 2, label: 'Alta', color: 'var(--amber)' },
  { id: 1, label: 'Normal', color: 'var(--blue)' },
  { id: 0, label: 'Baja', color: 'var(--ink-3)' },
]

export function newTask(patch = {}) {
  return {
    id: uid('t'), title: '', notes: '', area: 'uni', refId: null,
    due: '', priority: 1, estimate: 0, status: 'todo',
    createdAt: Date.now(), doneAt: null, folder: null, ...patch,
  }
}

export default function TaskEditor({ task, onClose }) {
  const { db, update, toast } = useStore()
  const exists = db.tasks.some((t) => t.id === task.id)
  const [t, setT] = useState(task)
  const set = (patch) => setT((x) => ({ ...x, ...patch }))

  const refs = t.area === 'uni' ? db.subjects : t.area === 'work' ? db.projects : []
  const spent = db.sessions.filter((s) => s.taskId === t.id).reduce((a, s) => a + s.seconds, 0)

  const persist = () => {
    update((d) => {
      const i = d.tasks.findIndex((x) => x.id === t.id)
      if (i >= 0) d.tasks[i] = t
      else d.tasks.unshift(t)
    })
  }

  const save = () => {
    if (!t.title.trim()) return toast('Ponle un título', 'err')
    persist()
    onClose()
  }

  const openSpace = () => {
    if (!t.title.trim()) return toast('Ponle un título antes', 'err')
    persist()
    onClose()
    location.hash = `#/espacio/tarea/${t.id}`
  }

  const remove = () => {
    if (!confirm('¿Eliminar la tarea? Los archivos de su carpeta no se borran.')) return
    update((d) => { d.tasks = d.tasks.filter((x) => x.id !== t.id) })
    onClose()
  }

  return (
    <Modal
      title={exists ? t.title || 'Tarea' : 'Nueva tarea'}
      subtitle={spent ? `${dur(spent, true)} dedicados` : undefined}
      onClose={onClose}
      foot={
        <>
          {exists && <button className="btn ghost danger" onClick={remove}><Icon name="trash" size={13} /> Eliminar</button>}
          <div className="spacer" />
          <button className="btn" onClick={openSpace}><Icon name="layers" size={13} /> Abrir espacio</button>
          <button className="btn primary" onClick={save}>Guardar</button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          <label>Tarea</label>
          <input className="input" autoFocus value={t.title} placeholder="Entregar práctica 2…" onChange={(e) => set({ title: e.target.value })} />
        </div>

        <div className="field">
          <label>Área</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {Object.entries(AREAS).map(([k, v]) => (
              <button key={k} className={`chip${t.area === k ? ' on' : ''}`} onClick={() => set({ area: k, refId: null })}>
                <span className="dot" style={{ background: v.color }} /> {v.label}
              </button>
            ))}
          </div>
        </div>

        {refs.length > 0 && (
          <div className="field">
            <label>{t.area === 'uni' ? 'Asignatura' : 'Proyecto'}</label>
            <select className="select" value={t.refId || ''} onChange={(e) => set({ refId: e.target.value || null })}>
              <option value="">— sin asignar —</option>
              {refs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        )}

        <div className="grid-3">
          <div className="field">
            <label>Fecha límite</label>
            <input className="input" type="date" value={t.due || ''} onChange={(e) => set({ due: e.target.value })} />
          </div>
          <div className="field">
            <label>Prioridad</label>
            <select className="select" value={t.priority} onChange={(e) => set({ priority: Number(e.target.value) })}>
              {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Estimación (min)</label>
            <input className="input" type="number" min="0" step="15" value={t.estimate || 0} onChange={(e) => set({ estimate: Number(e.target.value) })} />
          </div>
        </div>

        <div className="field">
          <label>Notas</label>
          <textarea className="textarea" value={t.notes} placeholder="Detalles, criterios de entrega…" onChange={(e) => set({ notes: e.target.value })} />
        </div>

        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm ghost" onClick={() => set({ due: today() })}>Hoy</button>
          <button className="btn sm ghost" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); set({ due: d.toISOString().slice(0, 10) }) }}>Mañana</button>
          <button className="btn sm ghost" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 7); set({ due: d.toISOString().slice(0, 10) }) }}>En una semana</button>
          <button className="btn sm ghost" onClick={() => set({ due: '' })}>Sin fecha</button>
        </div>

        <p className="dim" style={{ fontSize: 12, margin: 0 }}>
          Los documentos de la tarea van en su espacio de trabajo, con su propia carpeta en el disco.
          El tiempo se cuenta solo mientras estés ahí trabajando.
        </p>
      </div>
    </Modal>
  )
}
