import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { api } from '../lib/api.js'
import { useStore } from '../lib/store.jsx'
import { TOOL_SCHEMA, WRITE_TOOLS, runTool, undoAction, systemPrompt } from '../lib/assistantTools.js'
import { startDrag } from '../lib/drag.js'

/** Cuántas veces seguidas puede el modelo pedir herramientas antes de rendirse. */
const MAX_STEPS = 6

const SUGGESTIONS = [
  '¿Cuántas faltas más me puedo permitir?',
  '¿Cómo llevo la semana?',
  '¿Qué tengo pendiente para los próximos 7 días?',
  'Resume el documento que tengo abierto',
]

/**
 * Qué documento tiene delante ahora mismo.
 *
 * Cuando dice «este documento» se refiere al que está abierto en el espacio de
 * trabajo. El espacio guarda sus pestañas en `localStorage` y, con retraso, en
 * el `db.json`: se mira primero el sitio que se escribe al instante.
 */
function documentoAbierto(db) {
  const parts = (window.location.hash || '').slice(1).split('?')[0].split('/').filter(Boolean).map(decodeURIComponent)
  if (parts[0] !== 'espacio') return null
  const [, kind, id] = parts
  const entity =
    kind === 'uni' ? db.subjects.find((s) => s.id === id)
    : kind === 'trabajo' ? db.projects.find((p) => p.id === id)
    : db.tasks.find((t) => t.id === id)
  const root = entity?.folder
  if (!root) return null

  let state = null
  try { state = JSON.parse(localStorage.getItem('prolife.ws2:' + root) || 'null') } catch { state = null }
  if (!state) state = db.workspaces?.[root] || null

  for (const pane of state?.panes || []) {
    const tab = pane.tabs?.find((t) => t.id === pane.active) || pane.tabs?.[pane.tabs.length - 1]
    if (tab?.type === 'file' && tab.path) return { path: tab.path, name: tab.name || tab.path.split('/').pop() }
  }
  return null
}

/**
 * El ayudante. Habla con un Ollama que corre en este mismo ordenador y puede
 * usar herramientas para consultar tus datos o apuntarte cosas. Nada de esto
 * sale de la máquina.
 */
export default function Assistant({ open, onClose, width, setWidth }) {
  const { db, update, toast } = useStore()
  const cfg = db.settings.assistant || {}

  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const scroller = useRef(null)
  // el modelo necesita ver la base de datos recién escrita entre herramienta y
  // herramienta, así que se lee por referencia y no por la copia del render
  const dbRef = useRef(db)
  dbRef.current = db

  const model = cfg.model || status?.models?.[0]?.name || ''

  const check = useCallback(() => {
    api.aiStatus(cfg.url).then(setStatus).catch((e) => setStatus({ running: false, models: [], error: e.message }))
  }, [cfg.url])

  useEffect(() => { if (open) check() }, [open, check])
  useEffect(() => { scroller.current?.scrollTo({ top: 9e6, behavior: 'smooth' }) }, [msgs, busy])

  const drag = (e) => startDrag(e, (ev) => setWidth(Math.min(760, Math.max(320, window.innerWidth - ev.clientX))))

  const tools = useMemo(
    () => (cfg.allowWrite === false ? TOOL_SCHEMA.filter((t) => !WRITE_TOOLS.has(t.function.name)) : TOOL_SCHEMA),
    [cfg.allowWrite]
  )

  const send = async (text) => {
    const content = (text ?? input).trim()
    if (!content || busy) return
    setInput('')
    const visible = [...msgs, { role: 'user', content }]
    setMsgs(visible)
    setBusy(true)

    // Lo que el usuario ha escrito de verdad. Las herramientas lo usan para no
    // dejar pasar una asignatura o un proyecto que el modelo se haya inventado.
    const dicho = visible.filter((m) => m.role === 'user').map((m) => m.content).join(' \n ')
    const doc = documentoAbierto(dbRef.current)

    // Historial que ve el modelo: sin las tarjetas de acciones, que son cosa nuestra.
    const wire = [
      { role: 'system', content: systemPrompt(dbRef.current, { doc }) },
      ...visible.map((m) => ({ role: m.role, content: m.content, ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}) })),
    ]

    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const res = await api.aiChat({ url: cfg.url, model, messages: wire, tools })
        const reply = res.message || {}
        wire.push(reply)

        const calls = reply.tool_calls || []
        if (!calls.length) {
          setMsgs((m) => [...m, { role: 'assistant', content: reply.content || '(sin respuesta)' }])
          break
        }

        // El modelo pide herramientas: se ejecutan aquí y se le contesta.
        const done = []
        let ask = null
        for (const c of calls) {
          const name = c.function?.name
          let args = c.function?.arguments
          if (typeof args === 'string') { try { args = JSON.parse(args) } catch { args = {} } }

          if (cfg.allowWrite === false && WRITE_TOOLS.has(name)) {
            wire.push({ role: 'tool', tool_name: name, content: 'El usuario ha desactivado que puedas crear cosas. Dile que lo active en Ajustes.' })
            continue
          }

          const out = await runTool(name, args, { db: dbRef.current, update, dicho, doc })
          // Cuando faltan datos, la pregunta se la hace la herramienta y no el
          // modelo: un modelo pequeño se inventa lo que le falta antes que
          // preguntarlo, y así el usuario siempre acaba decidiendo él.
          if (out.ask) { ask = ask || out.ask; continue }
          wire.push({ role: 'tool', tool_name: name, content: out.text })
          if (out.action) done.push(out.action)
        }

        if (done.length) setMsgs((m) => [...m, { role: 'actions', actions: done }])
        if (ask) {
          setMsgs((m) => [...m, { role: 'assistant', content: ask }])
          break
        }
        if (step === MAX_STEPS - 1) {
          setMsgs((m) => [...m, { role: 'assistant', content: 'Me he liado dando vueltas. Pregúntamelo otra vez más concreto.' }])
        }
      }
    } catch (e) {
      setMsgs((m) => [...m, { role: 'error', content: e.message }])
    } finally {
      setBusy(false)
    }
  }

  const undo = (action, i) => {
    undoAction(action, update)
    toast('Deshecho')
    setMsgs((m) => m.map((x, j) => (j === i ? { ...x, actions: x.actions.map((a) => (a.id === action.id ? { ...a, undone: true } : a)) } : x)))
  }

  if (!open) return null

  const ready = status?.running && model

  return (
    <>
      <div className="dock-drag" onPointerDown={drag} />
      <aside className="dock" style={{ width }}>
        <div className="dock-head">
          <span className="glyph" style={{ background: 'var(--ink)', width: 19, height: 19, borderRadius: 5, display: 'grid', placeItems: 'center', color: 'var(--paper)' }}>
            <Icon name="sparkle" size={11} />
          </span>
          <strong style={{ fontSize: 13 }}>Ayudante</strong>
          {model && <span className="badge mono" title="Modelo de Ollama en uso">{model}</span>}
          <span className={`dot`} style={{ background: status?.running ? 'var(--green)' : 'var(--ink-3)' }} title={status?.running ? 'Ollama activo' : 'Ollama no responde'} />
          <div className="spacer" />
          <button className="btn ghost icon" title="Vaciar la conversación" onClick={() => setMsgs([])}>
            <Icon name="refresh" size={13} />
          </button>
          <button className="btn ghost icon" title="Cerrar (Ctrl+I)" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="dock-body chat" ref={scroller}>
          {!ready ? (
            <Offline status={status} model={model} onRetry={check} />
          ) : msgs.length === 0 ? (
            <div className="chat-intro">
              <p className="dim" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                Conoce tus asignaturas, tu horario, tus faltas y tus horas. Pregúntale, o dile que te
                apunte algo. Corre entero en tu ordenador.
              </p>
              <div className="stack" style={{ gap: 5 }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="link-tile" onClick={() => send(s)}>
                    <span className="glyph" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                      <Icon name="chevronR" size={10} />
                    </span>
                    <span style={{ fontSize: 12.5 }}>{s}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            msgs.map((m, i) => <Bubble key={i} m={m} onUndo={(a) => undo(a, i)} />)
          )}
          {busy && (
            <div className="chat-msg bot">
              <span className="dim" style={{ fontSize: 12.5 }}>pensando…</span>
            </div>
          )}
        </div>

        <form
          className="chat-input"
          onSubmit={(e) => { e.preventDefault(); send() }}
        >
          <textarea
            className="textarea"
            rows={2}
            placeholder={ready ? 'Pregunta o pide que te apunte algo…' : 'Ollama no está disponible'}
            disabled={!ready || busy}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          />
          <button className="btn primary icon" type="submit" disabled={!ready || busy || !input.trim()} title="Enviar">
            <Icon name="arrowUp" size={14} />
          </button>
        </form>
      </aside>
    </>
  )
}

function Bubble({ m, onUndo }) {
  if (m.role === 'actions') {
    return (
      <div className="chat-actions">
        {m.actions.map((a) => (
          <div key={a.id} className={`chat-action${a.undone ? ' undone' : ''}`}>
            <Icon name={a.undone ? 'x' : 'check'} size={12} />
            <a href={a.href} style={{ flex: 1, textDecoration: 'none' }}>{a.summary}</a>
            {!a.undone && <button className="btn sm ghost" onClick={() => onUndo(a)}>Deshacer</button>}
          </div>
        ))}
      </div>
    )
  }
  if (m.role === 'error') {
    return <div className="chat-msg err"><Icon name="x" size={12} /> {m.content}</div>
  }
  return <div className={`chat-msg ${m.role === 'user' ? 'me' : 'bot'}`}>{m.content}</div>
}

/** Qué falta para que esto funcione, dicho sin misterio. */
function Offline({ status, model, onRetry }) {
  const noModels = status?.running && !status.models?.length
  return (
    <div className="ws-blank" style={{ padding: 20 }}>
      <div className="display" style={{ fontSize: 20 }}>
        {!status ? 'Comprobando…'
          : !status.running ? 'Ollama no responde'
          : noModels ? 'Ollama está, pero sin modelos'
          : 'Falta elegir modelo'}
      </div>
      <p className="dim" style={{ maxWidth: '38ch', fontSize: 12.5, lineHeight: 1.6 }}>
        {noModels ? (
          <>Descarga uno desde una terminal. Para un portátil normal, <span className="mono">llama3.1:8b</span> va sobrado:</>
        ) : (
          <>
            El ayudante habla con <a href="https://ollama.com" onClick={(e) => { e.preventDefault(); api.openUrl('https://ollama.com') }} style={{ textDecoration: 'underline' }}>Ollama</a>,
            que corre en tu ordenador. Instálalo, descarga un modelo y vuelve:
          </>
        )}
      </p>
      <pre className="mono" style={{ fontSize: 11.5, background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 6, margin: 0 }}>
        ollama pull llama3.1:8b
      </pre>
      {status?.error && <p className="dim mono" style={{ fontSize: 11 }}>{status.error}</p>}
      <div className="row" style={{ gap: 6 }}>
        <button className="btn" onClick={onRetry}><Icon name="refresh" size={12} /> Reintentar</button>
        <a className="btn ghost" href="#/ajustes">Ajustes del ayudante</a>
      </div>
    </div>
  )
}
