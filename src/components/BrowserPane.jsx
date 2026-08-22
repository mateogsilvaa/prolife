import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { api } from '../lib/api.js'
import { useStore, isDesktop } from '../lib/store.jsx'

const normalize = (raw) => {
  const v = String(raw).trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  // con espacios o sin punto, se busca en vez de intentar navegar
  if (/\s/.test(v) || !/\.[a-z]{2,}/i.test(v)) return 'https://duckduckgo.com/?q=' + encodeURIComponent(v)
  return 'https://' + v
}

/** Navegador dentro del espacio de trabajo: buscar sin salir de la app. */
export default function BrowserPane({ tab, onUrlChange }) {
  const { db } = useStore()
  const view = useRef(null)
  const [input, setInput] = useState(tab.url || '')
  const [current, setCurrent] = useState(tab.url || '')
  const [loading, setLoading] = useState(false)
  const [nav, setNav] = useState({ back: false, forward: false })

  useEffect(() => {
    const el = view.current
    if (!el || !isDesktop) return
    const start = () => setLoading(true)
    const stop = () => {
      setLoading(false)
      try {
        const u = el.getURL()
        setCurrent(u)
        setInput(u)
        onUrlChange?.(u)
        setNav({ back: el.canGoBack(), forward: el.canGoForward() })
      } catch { /* aún no está listo */ }
    }
    el.addEventListener('did-start-loading', start)
    el.addEventListener('did-stop-loading', stop)
    return () => {
      el.removeEventListener('did-start-loading', start)
      el.removeEventListener('did-stop-loading', stop)
    }
  }, [onUrlChange])

  const go = (raw) => {
    const url = normalize(raw)
    if (!url) return
    setInput(url)
    setCurrent(url)
    if (isDesktop && view.current) view.current.loadURL(url)
    else api.openUrl(url)
    onUrlChange?.(url)
  }

  const quick = [
    db.settings.portalUrl && { name: db.settings.portalName || 'Campus', url: db.settings.portalUrl },
    ...(db.settings.links || []).map((l) => ({ name: l.name, url: l.url })),
  ].filter((x) => x && x.url)

  return (
    <div className="brw">
      <div className="brw-bar">
        <button className="btn ghost icon" disabled={!nav.back} onClick={() => view.current?.goBack()} title="Atrás">
          <Icon name="chevronL" size={14} />
        </button>
        <button className="btn ghost icon" disabled={!nav.forward} onClick={() => view.current?.goForward()} title="Adelante">
          <Icon name="chevronR" size={14} />
        </button>
        <button className="btn ghost icon" onClick={() => view.current?.reload()} title="Recargar">
          <Icon name={loading ? 'x' : 'refresh'} size={13} />
        </button>
        <input
          className="input mono"
          style={{ fontSize: 12 }}
          value={input}
          placeholder="Busca o escribe una dirección…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go(input)}
          onFocus={(e) => e.target.select()}
        />
        <button className="btn ghost icon" onClick={() => api.openUrl(current || input)} title="Abrir en el navegador del sistema">
          <Icon name="external" size={13} />
        </button>
      </div>

      {quick.length > 0 && !current && (
        <div className="brw-quick">
          <span className="eyebrow">Accesos</span>
          {quick.map((q, i) => (
            <button key={i} className="chip" onClick={() => go(q.url)}>{q.name}</button>
          ))}
        </div>
      )}

      <div className="brw-body">
        {!isDesktop ? (
          <div className="ws-blank">
            <div className="display">Solo en la app de escritorio</div>
            <p className="dim">Los sitios web bloquean que se los meta en un iframe del navegador.</p>
          </div>
        ) : current ? (
          <webview ref={view} src={current} partition="persist:browser" allowpopups="true" style={{ flex: 1, minHeight: 0 }} />
        ) : (
          <div className="ws-blank">
            <Icon name="search" size={22} style={{ opacity: 0.4 }} />
            <p className="dim">Escribe arriba para buscar o ir a una página.</p>
          </div>
        )}
      </div>
    </div>
  )
}
