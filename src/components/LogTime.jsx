import React, { useState } from 'react'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import { useStore, uid } from '../lib/store.jsx'
import { today, parseIso } from '../lib/date.js'

/**
 * Apuntar tiempo que ya ha pasado, para cuando se te olvidó darle a «Trabajar
 * en esto» antes de ponerte. Crea la misma clase de sesión que deja el
 * contador automático —mismo `sessions.push`—, solo que con `source: 'manual'`
 * y sin que nadie la haya medido en directo.
 */
export default function LogTime({ area, refId, label }) {
  const { update, toast } = useStore()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(today())
  const [minutes, setMinutes] = useState('')

  const mins = Math.round(Number(minutes)) || 0
  const valid = mins > 0 && mins <= 24 * 60 && !!date

  const save = () => {
    if (!valid) return
    const start = parseIso(date).getTime()
    update((d) => {
      d.sessions.push({
        id: uid('s'), area, refId, taskId: null, label, date,
        start, end: start + mins * 60000, seconds: mins * 60, source: 'manual',
      })
    })
    toast(`Apuntados ${mins} min · ${date === today() ? 'hoy' : date}`)
    setOpen(false)
    setMinutes('')
    setDate(today())
  }

  return (
    <>
      <button className="btn ghost" title="Apuntar tiempo que se te olvidó contar" onClick={() => setOpen(true)}>
        <Icon name="clock" size={13} /> Apuntar tiempo
      </button>
      {open && (
        <Modal
          title="Apuntar tiempo"
          onClose={() => setOpen(false)}
          foot={
            <>
              <div className="spacer" />
              <button className="btn primary" onClick={save} disabled={!valid}>Guardar</button>
            </>
          }
        >
          <div className="stack">
            <p className="dim" style={{ fontSize: 12.5, marginTop: 0 }}>
              Para cuando se te olvidó darle a «Trabajar en esto» antes de ponerte: cuánto tiempo, y qué
              día. Cuenta igual que si lo hubiera medido el contador.
            </p>
            <div className="grid-2">
              <div className="field">
                <label>Fecha</label>
                <input className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Minutos</label>
                <input
                  className="input" type="number" min="1" max="1440" autoFocus
                  value={minutes} placeholder="45"
                  onChange={(e) => setMinutes(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && valid && save()}
                />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
