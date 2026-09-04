import React, { useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import Icon from './Icon.jsx'
import { useStore, AREAS, uid, refLabel, refColor } from '../lib/store.jsx'
import { dur, today, fmtDate, iso, addDays, parseIso } from '../lib/date.js'

/**
 * Revisión y corrección del tiempo medido automáticamente. La detección se
 * equivoca a veces (te levantas, cambias de tarea sin cambiar de pantalla),
 * así que aquí se edita, reasigna, divide o borra.
 */
export default function TimeReview({ onClose }) {
  const { db, update } = useStore()
  const [date, setDate] = useState(today())
  const [editing, setEditing] = useState(null)
  const [splitting, setSplitting] = useState(null)

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
              <button
                className="btn ghost icon"
                title={s.seconds < 120 ? 'Demasiado corto para partirlo' : 'Partir en dos'}
                disabled={s.seconds < 120}
                onClick={() => setSplitting(s)}
              >
                <Icon name="layers" size={12} />
              </button>
              <button className="btn ghost icon" title="Eliminar" onClick={() => del(s.id)}><Icon name="trash" size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {editing && <SegmentForm segment={editing} onClose={() => setEditing(null)} />}
      {splitting && <SplitForm segment={splitting} onClose={() => setSplitting(null)} />}
    </Modal>
  )
}

const blank = (date) => ({
  id: uid('s'), area: 'uni', refId: null, taskId: null, label: '', date,
  ...horas(date, Date.now(), 1800), seconds: 1800, source: 'manual',
})

/**
 * `start` y `end` de un tramo, dentro del día que dice ser.
 *
 * Ponían la hora del momento de crearlo viniera la fecha que viniera, así que
 * un tramo añadido al martes pasado llevaba la hora de hoy: la revisión ordena
 * por `start` y enseña esa hora, y `end` ni siquiera cuadraba con la duración,
 * que es lo que mira el conteo automático para decidir si fusiona dos tramos
 * cercanos. Se conserva la hora del día que tuviera; si no tenía, las 9.
 */
function horas(date, prevStart, seconds) {
  const previo = prevStart ? new Date(prevStart) : null
  const start = parseIso(date)
  start.setHours(previo ? previo.getHours() : 9, previo ? previo.getMinutes() : 0, 0, 0)
  return { start: start.getTime(), end: start.getTime() + seconds * 1000 }
}

/**
 * Partir un tramo en dos. Pasa constantemente: media hora seguida delante del
 * ordenador que en realidad fueron veinte minutos de una asignatura y diez de
 * otra. Se corta por donde digas y la segunda mitad se reasigna después con el
 * botón de editar, que ya sabe hacer eso.
 */
function SplitForm({ segment, onClose }) {
  const { db, update } = useStore()
  const totalMin = Math.round(segment.seconds / 60)
  const [first, setFirst] = useState(Math.max(1, Math.round(totalMin / 2)))

  const firstMin = Math.min(totalMin - 1, Math.max(1, Number(first) || 1))
  const secondMin = totalMin - firstMin
  const refs = segment.area === 'uni' ? db.subjects : segment.area === 'work' ? db.projects : []
  const [refId, setRefId] = useState(segment.refId || '')

  const at = (min) =>
    segment.start ? new Date(segment.start + min * 60000).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : null

  const save = () => {
    const start = segment.start || null
    const head = {
      ...segment,
      seconds: firstMin * 60,
      end: start ? start + firstMin * 60000 : segment.end,
      source: segment.source === 'auto' ? 'fixed' : segment.source,
    }
    const tail = {
      ...segment,
      id: uid('s'),
      start: start ? start + firstMin * 60000 : null,
      end: segment.end,
      // Lo que queda de verdad, no `secondMin * 60`: los minutos vienen de
      // redondear el total, así que las dos mitades sumaban el total redondeado
      // y partir un tramo se comía hasta 30 segundos. Esta es la pantalla que
      // arregla el conteo; no puede ser la que lo estropee.
      seconds: segment.seconds - head.seconds,
      refId: refId || null,
      label: refs.find((r) => r.id === refId)?.name || segment.label,
      source: 'fixed',
    }
    update((d) => {
      const i = d.sessions.findIndex((x) => x.id === segment.id)
      if (i < 0) return
      d.sessions.splice(i, 1, head, tail)
    })
    onClose()
  }

  return (
    <Modal
      title="Partir el tramo"
      subtitle={`${dur(segment.seconds, true)} · ${segment.label || refLabel(db, segment)}`}
      onClose={onClose}
      foot={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Partir</button></>}
    >
      <div className="stack">
        <div className="field">
          <label>Minutos del primer tramo</label>
          <input
            className="input"
            type="number"
            min="1"
            max={totalMin - 1}
            value={first}
            onChange={(e) => setFirst(e.target.value)}
          />
          <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
            {dur(firstMin * 60)} {at(0) && `(${at(0)}–${at(firstMin)})`} · después {dur(segment.seconds - firstMin * 60)}
            {at(firstMin) && ` (${at(firstMin)}–${at(totalMin)})`}
          </div>
        </div>
        {refs.length > 0 && (
          <div className="field">
            <label>El segundo tramo pasa a</label>
            <select className="select" value={refId} onChange={(e) => setRefId(e.target.value)}>
              <option value="">— igual que ahora —</option>
              {refs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        )}
      </div>
    </Modal>
  )
}

function SegmentForm({ segment, onClose }) {
  const { db, update } = useStore()
  const [s, setS] = useState({ ...segment, minutes: Math.round(segment.seconds / 60) })
  const set = (p) => setS((x) => ({ ...x, ...p }))
  const refs = s.area === 'uni' ? db.subjects : s.area === 'work' ? db.projects : []

  const save = () => {
    const seconds = Math.max(60, Math.round((Number(s.minutes) || 0) * 60))
    const value = {
      ...s,
      seconds,
      // Cambiar la fecha o los minutos tiene que arrastrar el reloj del tramo:
      // si no, se quedaba diciendo ser de un día con la hora de otro, y con un
      // `end` que no cuadraba con lo que dura.
      ...horas(s.date, s.start, seconds),
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
