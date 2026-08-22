import React, { useState } from 'react'
import Modal from './Modal.jsx'
import Icon from './Icon.jsx'
import { useStore, uid } from '../lib/store.jsx'
import { today, fmtDate, daysUntil } from '../lib/date.js'

export const KINDS = [
  { id: 'examen', label: 'Examen' },
  { id: 'entrega', label: 'Entrega evaluable' },
  { id: 'practica', label: 'Práctica' },
  { id: 'presentacion', label: 'Presentación' },
]

export const kindLabel = (k) => KINDS.find((x) => x.id === k)?.label || 'Examen'

export function newExam(patch = {}) {
  return {
    id: uid('ex'), subjectId: null, title: '', kind: 'examen',
    date: today(), start: '', end: '', room: '', weight: 0,
    notes: '', grade: null, ...patch,
  }
}

/** Un examen o una entrega evaluable, con su fecha, su peso y su nota. */
export default function ExamEditor({ exam, onClose }) {
  const { db, update, toast } = useStore()
  const [e, setE] = useState(exam)
  const exists = (db.exams || []).some((x) => x.id === e.id)
  const set = (p) => setE((x) => ({ ...x, ...p }))

  const save = () => {
    if (!e.title.trim()) return toast('Ponle un nombre', 'err')
    if (!e.subjectId) return toast('Elige la asignatura', 'err')
    if (!e.date) return toast('Hace falta la fecha', 'err')
    const value = { ...e, weight: Number(e.weight) || 0, grade: e.grade === '' ? null : e.grade }
    update((d) => {
      d.exams ||= []
      const i = d.exams.findIndex((x) => x.id === value.id)
      if (i >= 0) d.exams[i] = value
      else d.exams.push(value)
    })
    onClose()
  }

  const remove = () => {
    if (!confirm('¿Eliminar del calendario?')) return
    update((d) => { d.exams = (d.exams || []).filter((x) => x.id !== e.id) })
    onClose()
  }

  const days = e.date ? daysUntil(e.date) : null

  return (
    <Modal
      title={exists ? e.title || kindLabel(e.kind) : `Nuevo ${kindLabel(e.kind).toLowerCase()}`}
      subtitle={days === null ? undefined : days > 0 ? `Faltan ${days} días` : days === 0 ? 'Es hoy' : `Fue hace ${-days} días`}
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
          <input className="input" autoFocus value={e.title} placeholder="Parcial 1, entrega de la práctica 3…" onChange={(ev) => set({ title: ev.target.value })} />
        </div>

        <div className="field">
          <label>Tipo</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {KINDS.map((k) => (
              <button key={k.id} className={`chip${e.kind === k.id ? ' on' : ''}`} onClick={() => set({ kind: k.id })}>{k.label}</button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Asignatura</label>
          <select className="select" value={e.subjectId || ''} onChange={(ev) => set({ subjectId: ev.target.value || null })}>
            <option value="">— elige —</option>
            {db.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="grid-3">
          <div className="field"><label>Fecha</label><input className="input" type="date" value={e.date} onChange={(ev) => set({ date: ev.target.value })} /></div>
          <div className="field"><label>Desde</label><input className="input" type="time" value={e.start || ''} onChange={(ev) => set({ start: ev.target.value })} /></div>
          <div className="field"><label>Hasta</label><input className="input" type="time" value={e.end || ''} onChange={(ev) => set({ end: ev.target.value })} /></div>
        </div>

        <div className="grid-3">
          <div className="field"><label>Aula</label><input className="input" value={e.room || ''} onChange={(ev) => set({ room: ev.target.value })} /></div>
          <div className="field">
            <label>Peso en la nota (%)</label>
            <input className="input" type="number" min="0" max="100" value={e.weight || 0} onChange={(ev) => set({ weight: ev.target.value })} />
          </div>
          <div className="field">
            <label>Nota sacada</label>
            <input className="input" type="number" min="0" max="10" step="0.1" placeholder="—" value={e.grade ?? ''} onChange={(ev) => set({ grade: ev.target.value === '' ? null : Number(ev.target.value) })} />
          </div>
        </div>

        <div className="field">
          <label>Qué entra / condiciones</label>
          <textarea className="textarea" value={e.notes || ''} placeholder="Temas 1 a 4, sin apuntes, calculadora permitida…" onChange={(ev) => set({ notes: ev.target.value })} />
        </div>

        <p className="dim" style={{ fontSize: 12, margin: 0 }}>
          Aparece en el calendario y en la ficha de la asignatura. La nota sirve para saber cuánto
          llevas evaluado y qué te queda.
        </p>
      </div>
    </Modal>
  )
}

/** Fila compacta para listas de exámenes. */
export function ExamRow({ exam, subject, onClick }) {
  const days = exam.date ? daysUntil(exam.date) : null
  const past = days !== null && days < 0
  return (
    <div className="list-row click" onClick={onClick} style={{ opacity: past ? 0.55 : 1 }}>
      <span className="dot" style={{ background: subject?.color || 'var(--ink-3)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13 }}>{exam.title}</div>
        <div className="dim" style={{ fontSize: 11 }}>
          {kindLabel(exam.kind)}
          {subject ? ` · ${subject.name}` : ''}
          {exam.weight ? ` · ${exam.weight}% de la nota` : ''}
          {exam.room ? ` · ${exam.room}` : ''}
        </div>
      </div>
      {exam.grade != null && <span className="badge">{exam.grade}</span>}
      <span className="mono" style={{ fontSize: 11.5, textAlign: 'right', color: days !== null && days <= 3 && !past ? 'var(--accent)' : '' }}>
        {fmtDate(exam.date)}{exam.start ? ` ${exam.start}` : ''}
      </span>
    </div>
  )
}
