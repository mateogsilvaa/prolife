import React, { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { useStore, AREAS } from '../lib/store.jsx'
import { useTracker } from '../lib/tracker.jsx'
import { clock, dur, today } from '../lib/date.js'

/**
 * Qué está midiendo la app ahora mismo, y el botón para decidirlo tú.
 *
 * Una sesión de trabajo se elige aquí y sigue corriendo estés donde estés
 * —dentro de la app, en el Word o con los apuntes en papel—, que es lo que
 * hace que medir el tiempo no obligue a trabajar dentro del espacio.
 */
export default function StatusBar({ onReview }) {
  const { db, toast } = useStore()
  const { context, focus, engaged, seconds, paused, stale, setPaused, stop, enabled } = useTracker()
  const [picking, setPicking] = useState(false)

  const todaySecs = db.sessions.filter((s) => s.date === today()).reduce((a, s) => a + s.seconds, 0)
  const goal = (db.settings.dailyGoalMin || 300) * 60

  const state = !enabled ? 'off' : paused ? 'off' : !context ? 'none' : engaged ? 'live' : 'idle'
  const explain = {
    off: 'Medición pausada',
    none: 'Nada en marcha: elige en qué trabajas o abre un espacio',
    live: focus ? 'Sesión en marcha: cuenta aunque salgas de la app' : 'Contando: estás trabajando en esto',
    idle: 'En pausa: la app no tiene el foco o llevas un rato sin tocar nada',
  }[state]

  const end = () => {
    const total = stop()
    // El mínimo de un minuto es de la detección automática, no de esto: una
    // sesión elegida a mano se guarda siempre (ver `tracker.jsx`), «si la
    // paraste, la querías». Decir que no se guardaba nada era mentira, y el
    // tiempo aparecía luego en las estadísticas sin saber de dónde salía.
    // La forma larga solo a partir del minuto: `dur(7, true)` diría «0 min».
    toast(total > 0 ? `Sesión guardada · ${dur(total, total >= 60)}` : 'La sesión no llegó a contar nada')
  }

  return (
    <>
      <div
        className={`timer-pill ${state === 'live' ? 'live' : state === 'idle' ? 'idle' : ''}${focus ? ' focus' : ''}`}
        title={explain}
      >
        {state === 'live' ? (
          <span className="pulse" />
        ) : (
          <span className="dot" style={{ background: state === 'idle' ? 'var(--amber)' : 'var(--ink-3)' }} />
        )}

        {context ? (
          <>
            <span className="timer-clock">{clock(seconds)}</span>
            <span className="timer-label muted">{context.label}</span>
            {focus && <span className="badge">sesión</span>}
          </>
        ) : (
          <span className="timer-label dim">{state === 'off' ? 'Medición pausada' : 'Nada en marcha'}</span>
        )}

        {context && (
          <button
            className="btn ghost icon"
            style={{ padding: 3 }}
            title={paused ? 'Reanudar la medición' : 'Pausar la medición'}
            onClick={() => setPaused(!paused)}
          >
            <Icon name={paused ? 'play' : 'stop'} size={10} fill="currentColor" />
          </button>
        )}

        {focus ? (
          <button className="btn sm primary" style={{ padding: '2px 9px' }} onClick={end} title="Terminar y guardar">
            Terminar
          </button>
        ) : (
          <button className="btn sm" style={{ padding: '2px 9px' }} onClick={() => setPicking(true)}>
            <Icon name="play" size={9} fill="currentColor" /> Trabajar en…
          </button>
        )}
      </div>

      {stale && focus && (
        <span className="dim" style={{ fontSize: 11 }} title="La sesión sigue contando: párala si ya no estás">
          sin tocar el ordenador hace un rato
        </span>
      )}

      <div className="row" style={{ gap: 8 }}>
        <div style={{ width: 86 }}>
          <div className="meter"><i style={{ width: `${Math.min(100, (todaySecs / goal) * 100)}%` }} /></div>
        </div>
        <button className="btn ghost sm" onClick={onReview} title="Ver y corregir el tiempo registrado">
          <span className="mono" style={{ fontSize: 11 }}>{dur(todaySecs)} hoy</span>
          <Icon name="edit" size={11} />
        </button>
      </div>

      {picking && <FocusPicker onClose={() => setPicking(false)} />}
    </>
  )
}

/** Elige en qué se trabaja. Lo que más usas primero, y se busca escribiendo. */
export function FocusPicker({ onClose, onPicked }) {
  const { db, toast } = useStore()
  const { start } = useTracker()
  const [q, setQ] = useState('')
  const box = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) onClose() }
    window.addEventListener('keydown', onKey)
    // en el mismo tick el clic que abrió el panel lo cerraría
    const t = setTimeout(() => window.addEventListener('mousedown', onDown), 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const options = useMemo(() => {
    const recent = new Map()
    for (const s of [...db.sessions].reverse().slice(0, 400)) {
      const k = `${s.area}:${s.refId || '-'}:${s.taskId || '-'}`
      recent.set(k, (recent.get(k) || 0) + s.seconds)
    }
    const rank = (o) => -(recent.get(`${o.area}:${o.refId || '-'}:${o.taskId || '-'}`) || 0)

    const out = [
      ...db.subjects.map((s) => ({ area: 'uni', refId: s.id, taskId: null, label: s.name, color: s.color, sub: 'asignatura' })),
      ...db.projects.map((p) => ({ area: 'work', refId: p.id, taskId: null, label: p.name, color: p.color, sub: 'proyecto' })),
      ...db.tasks
        .filter((t) => t.status !== 'done')
        .slice(0, 30)
        .map((t) => ({
          area: t.area, refId: t.refId, taskId: t.id, label: t.title,
          color: AREAS[t.area]?.color, sub: 'tarea',
        })),
      { area: 'life', refId: null, taskId: null, label: 'Otras cosas', color: AREAS.life.color, sub: 'sin asignar' },
    ]

    const needle = q.trim().toLowerCase()
    return out
      .filter((o) => o.label && (!needle || o.label.toLowerCase().includes(needle)))
      .sort((a, b) => rank(a) - rank(b))
  }, [db, q])

  const pick = (o) => {
    start({ area: o.area, refId: o.refId, taskId: o.taskId, label: o.label })
    toast(`Contando tiempo en ${o.label}`)
    onPicked?.(o)
    onClose()
  }

  return (
    <div className="pop" ref={box}>
      <div className="pop-head">
        <Icon name="search" size={13} />
        <input
          className="input"
          autoFocus
          placeholder="¿En qué vas a trabajar?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && options[0]) pick(options[0]) }}
        />
      </div>
      <div className="pop-list">
        {options.map((o, i) => (
          <button key={i} className="pop-row" onClick={() => pick(o)}>
            <span className="dot" style={{ background: o.color }} />
            <span className="label">{o.label}</span>
            <span className="dim" style={{ fontSize: 11 }}>{o.sub}</span>
          </button>
        ))}
        {options.length === 0 && <p className="dim" style={{ fontSize: 12, padding: '8px 10px', margin: 0 }}>Nada con ese nombre.</p>}
      </div>
      <div className="pop-foot dim">
        La sesión cuenta aunque cierres esta ventana o trabajes fuera de la app. Párala cuando termines.
      </div>
    </div>
  )
}
