import React, { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { api } from '../lib/api.js'
import { isDesktop } from '../lib/store.jsx'

/**
 * VS Code de verdad, empotrado. Se apoya en `code serve-web`, el servidor web
 * oficial que trae la instalación de VS Code del usuario: mismas extensiones,
 * mismo marketplace, mismos ajustes. Nada que descargar aparte.
 */
export default function CodePane({ folder }) {
  const [state, setState] = useState({ phase: 'checking' })
  const view = useRef(null)

  const check = useCallback(async () => {
    try {
      const s = await api.codeStatus()
      if (!s.installed) return setState({ phase: 'missing', info: s })
      if (!s.accepted) return setState({ phase: 'license', info: s })
      setState({ phase: 'starting', info: s })
      const r = await api.codeStart(folder)
      setState({ phase: 'ready', url: r.url, info: s })
    } catch (e) {
      setState({ phase: 'error', message: e.message })
    }
  }, [folder])

  useEffect(() => { check() }, [check])

  const accept = async () => {
    await api.codeAccept(true)
    check()
  }

  if (state.phase === 'ready') {
    return (
      <div className="code-pane">
        <div className="code-bar">
          <Icon name="code" size={12} />
          <span className="mono" style={{ fontSize: 11 }}>{folder || 'raíz'}</span>
          <div className="spacer" />
          <button className="btn ghost icon" title="Recargar el editor" onClick={() => view.current?.reload()}>
            <Icon name="refresh" size={12} />
          </button>
          <button className="btn ghost icon" title="Abrir en la app de VS Code" onClick={() => api.openInCode(folder)}>
            <Icon name="external" size={12} />
          </button>
        </div>
        {isDesktop ? (
          <webview ref={view} src={state.url} partition="persist:vscode" allowpopups="true" style={{ flex: 1, minHeight: 0 }} />
        ) : (
          <iframe title="VS Code" src={state.url} style={{ flex: 1, border: 'none', minHeight: 0 }} />
        )}
      </div>
    )
  }

  return (
    <div className="ws-blank">
      {state.phase === 'checking' && <p className="dim">Comprobando VS Code…</p>}

      {state.phase === 'starting' && (
        <>
          <div className="display">Arrancando VS Code</div>
          <p className="dim" style={{ maxWidth: '40ch' }}>
            La primera vez descarga sus componentes de servidor y puede tardar un minuto.
            Las siguientes es inmediato.
          </p>
        </>
      )}

      {state.phase === 'missing' && (
        <>
          <div className="display">VS Code no está instalado</div>
          <p className="dim" style={{ maxWidth: '42ch' }}>
            El editor integrado usa tu propia instalación de VS Code. Instálalo desde
            code.visualstudio.com y vuelve a intentarlo.
          </p>
          <button className="btn" onClick={check}><Icon name="refresh" size={13} /> Reintentar</button>
        </>
      )}

      {state.phase === 'license' && (
        <>
          <div className="display">Falta tu permiso</div>
          <p className="dim" style={{ maxWidth: '46ch', lineHeight: 1.55 }}>
            Para abrir VS Code aquí dentro hay que arrancar su servidor web, y Microsoft exige
            que aceptes sus <a href="#" onClick={(e) => { e.preventDefault(); api.openUrl(state.info.licenseUrl) }} style={{ textDecoration: 'underline' }}>términos de licencia del servidor</a>{' '}
            y su <a href="#" onClick={(e) => { e.preventDefault(); api.openUrl(state.info.privacyUrl) }} style={{ textDecoration: 'underline' }}>declaración de privacidad</a>.
            No lo acepto por ti: decídelo tú.
          </p>
          <p className="dim" style={{ fontSize: 11.5, maxWidth: '46ch' }}>
            Todo corre en tu ordenador, escuchando solo en 127.0.0.1 y protegido con un testigo
            aleatorio. La telemetría va desactivada.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={() => api.openUrl(state.info.licenseUrl)}>Leer los términos</button>
            <button className="btn primary" onClick={accept}>Acepto, arranca el editor</button>
          </div>
        </>
      )}

      {state.phase === 'error' && (
        <>
          <div className="display">No se pudo arrancar</div>
          <p className="dim mono" style={{ fontSize: 11.5, maxWidth: '48ch', wordBreak: 'break-word' }}>{state.message}</p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={check}><Icon name="refresh" size={13} /> Reintentar</button>
            <button className="btn ghost" onClick={() => api.openInCode(folder)}>Abrir VS Code fuera</button>
          </div>
        </>
      )}
    </div>
  )
}
