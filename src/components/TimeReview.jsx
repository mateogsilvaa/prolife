import React, { useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import Icon from './Icon.jsx'
import { useStore, AREAS, uid, refLabel, refColor } from '../lib/store.jsx'
import { dur, today, fmtDate, iso, addDays } from '../lib/date.js'

/**
 * Revisión y corrección del tiempo medido automáticamente. La detección se
 * equivoca a veces (te levantas, cambias de tarea sin cambiar de pantalla),
 * así que aquí se edita, reasigna, divide o borra.
 */
export default function TimeReview({ onClose }) {
  const { db, update } = useStore()
  const [date, setDate] = useState(today())
  const [editing, setEditing] = useState(null)

  const rows = useMemo(
    () => db.sessions.filter((s) => s.date === date).sort((a, b) => (a.start || 0) - (b.start || 0)),
    [db.sessions, date]
  )
  const total = rows.reduce((a, s) => a + s.seconds, 0)
  const max = Math.max(...rows.map((s) => s.seconds), 1)

  const del = (id) => update((d) => { d.sessions = d.sessions.filter((s) => s.id !== id) })

  return (
    <Modal
      title="Tiempo registrado"
      subtitle={`${dur(total, true)} en total · se mide solo, pero manda lo que digas tú`}
      onClose={onClose}
      head={
        <div className="row" style={{ gap: 4 }}>
          <button className="btn ghost icon" onClick={() => setDate(iso(addDays(new Date(date.replace(/-/g, '/')), -1)))}><Icon name="chevronL" size={14} /></button>
          <input className="input" style={{ width: 140 }} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn ghost icon" disabled={date >= today()} onClick={() => setDate(iso(addDays(new Date(date.replace(/-/g, '/')), 1)))}><Icon name="chevronR" size={14} /></button>
        </div>
      }
      foot={
        <>
          <button className="btn ghost" onClick={() => setEditing(blank(date))}><Icon name="plus" size={13} /> Añadir tramo</button>
          <div className="spacer" />
          <button className="btn primary" onClick={onClose}>Hecho</button>
        </>
      }
    >
      {rows.length === 0 ? (
        <div className="empty">
          <div className="display">Nada registrado {date === today() ? 'hoy' : 'ese día'}</div>
          <p style={{ maxWidth: '40ch', margin: '0 auto' }}>
            El tiempo se cuenta al abrir una asignatura, tarea o proyecto y trabajar en ella.
            También puedes añadir un tramo a mano.
          </p>
        </div>
      ) : (
        <div className="list">
          {rows.map((s) => (
            <div key={s.id} className="tl-row">
              <span className="mono dim" style={{ width: 44 }}>
                {s.start ? new Date(s.start).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
              <div style={{ width: 96 }}>
                <div className="tl-bar" style={{ width: `${(s.seconds / max) * 100}%`, background: refColor(db, s) }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label || refLabel(db, s)}</div>
                <div className="dim" style={{ fontSize: 11 }}>
                  {AREAS[s.area]?.label}
                  {s.source === 'auto' ? ' · detectado' : s.source === 'manual' ? ' · a mano' : ' · corregido'}
                </div>
              </div>
              <span className="mono" style={{ width: 52, textAlign: 'right' }}>{dur(s.seconds)}</span>
              <button className="btn ghost icon" title="Editar" onClick={() => setEditing(s)}><Icon name="edit" size={12} /></button>
              <button className="btn ghost icon" title="Eliminar" onClick={() => del(s.id)}><Icon name="trash" size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {editing && <SegmentForm segment={editing} onClose={() => setEditing(null)} />}
    </Modal>
  )
}

const blank = (date) => ({
  id: uid('s'), area: 'uni', refId: null, taskId: null, label: '', date,
  start: Date.now(), end: Date.now(), seconds: 1800, source: 'manual',
})

function SegmentForm({ segment, onClose }) {
  const { db, update } = useStore()
  const [s, setS] = useState({ ...segment, minutes: Math.round(segment.seconds / 60) })
  const set = (p) => setS((x) => ({ ...x, ...p }))
  const refs = s.area === 'uni' ? db.subjects : s.area === 'work' ? db.projects : []

  const save = () => {
    const value = {
      ...s,
      seconds: Math.max(60, Math.round((Number(s.minutes) || 0) * 60)),
      label: s.label || refs.find((r) => r.id === s.refId)?.name || AREAS[s.area].label,
      source: s.source === 'auto' ? 'fixed' : s.source,
    }
    delete value.minutes
    update((d) => {
      const i = d.sessions.findIndex((x) => x.id === value.id)
      if (i >= 0) d.sessions[i] = value
      else d.sessions.push(value)
    })
    onClose()
  }

  return (
    <Modal
      title="Corregir tramo"
      onClose={onClose}
      foot={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Guardar</button></>}
    >
      <div className="stack">
        <div className="field">
          <label>Área</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {Object.entries(AREAS).map(([k, v]) => (
              <button key={k} className={`chip${s.area === k ? ' on' : ''}`} onClick={() => set({ area: k, refId: null })}>
                <span className="dot" style={{ background: v.color }} /> {v.label}
              </button>
            ))}
          </div>
        </div>
        {refs.length > 0 && (
          <div className="field">
            <label>{s.area === 'uni' ? 'Asignatura' : 'Proyecto'}</label>
            <select className="select" value={s.refId || ''} onChange={(e) => set({ refId: e.target.value || null, label: refs.find((r) => r.id === e.target.value)?.name || '' })}>
              <option value="">— sin asignar —</option>
              {refs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        )}
        <div className="grid-2">
          <div className="field"><label>Minutos</label><input className="input" type="number" min="1" value={s.minutes} onChange={(e) => set({ minutes: e.target.value })} /></div>
          <div className="field"><label>Fecha</label><input className="input" type="date" value={s.date} onChange={(e) => set({ date: e.target.value })} /></div>
        </div>
        <div className="field"><label>Etiqueta</label><input className="input" value={s.label} placeholder="Opcional" onChange={(e) => set({ label: e.target.value })} /></div>
      </div>
    </Modal>
  )
}
