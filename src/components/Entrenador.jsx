import React, { useCallback, useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { useStore } from '../lib/store.jsx'
import { api, enDrive } from '../lib/api.js'
import { bloqueActual, bloqueTexto } from '../lib/coach.js'

/**
 * La conexión con la app de tu entrenador (RB Team). La hace el servidor del
 * ordenador, que es quien guarda el token; la tablet y la web ven lo que
 * trae, porque entra en la base como todo lo demás.
 */
export function EntrenadorSettings() {
  const { db, toast } = useStore()
  const [estado, setEstado] = useState(null)
  const [token, setToken] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const mirar = useCallback(() => {
    if (enDrive) return
    api.rbEstado().then(setEstado).catch(() => {})
  }, [])
  useEffect(() => { mirar() }, [mirar])

  const tras = (r) => {
    setEstado(r)
    if (r.ok && r.ultima) toast(`Datos del entrenador al día: ${r.ultima.entrenos} entrenos actualizados`)
    else if (r.error) toast(r.error, 'err')
  }
  const conectar = async () => {
    setOcupado(true)
    try {
      tras(await api.rbToken(token.trim()))
      setToken('')
    } catch (e) {
      toast(e.message, 'err')
    } finally {
      setOcupado(false)
    }
  }
  const sincronizar = async () => {
    setOcupado(true)
    try { tras(await api.rbSync()) } catch (e) { toast(e.message, 'err') } finally { setOcupado(false) }
  }
  const desconectar = async () => {
    if (!confirm('¿Dejar de traer los datos del entrenador? Lo que ya ha entrado se queda.')) return
    setEstado(await api.rbToken(''))
  }

  const bloque = bloqueActual(db)
  const ult = estado?.ultima
  return (
    <div className="card">
      <div className="card-head">
        <h3>Entrenador (RB Team)</h3>
        {(estado?.conectado || db.coach?.actualizado) && <span className="badge">conectado</span>}
      </div>
      <p className="dim" style={{ fontSize: 12.5, marginTop: 0, lineHeight: 1.6 }}>
        Lo que rellenas en la app de tu entrenador entra aquí solo, cada hora: el formulario de
        cada entreno (RPE, minutos, CMJ, energía, ganas, sensaciones), los tiempos de las series y
        las molestias. Si ese día ya lo habías apuntado aquí, se completa ese entreno en vez de
        duplicarlo. También se ven las sesiones que te pone y el bloque en el que estás.
      </p>
      {db.coach?.actualizado && (
        <p style={{ fontSize: 12.5, margin: '0 0 10px' }}>
          {bloque ? <><b>{bloqueTexto(bloque)}</b> · </> : null}
          <span className="dim">datos de {new Date(db.coach.actualizado).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </p>
      )}
      {enDrive ? (
        <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>Se conecta desde la app del ordenador; lo que traiga se ve también aquí.</p>
      ) : estado?.conectado ? (
        <div className="row wrap" style={{ gap: 6 }}>
          <button className="btn primary" disabled={ocupado} onClick={sincronizar}>
            <Icon name="refresh" size={13} /> {ocupado ? 'Trayendo…' : 'Sincronizar ahora'}
          </button>
          <button className="btn ghost" onClick={desconectar}>Desconectar</button>
        </div>
      ) : (
        <div className="row wrap" style={{ gap: 6 }}>
          <input
            className="input" type="password" autoComplete="off" placeholder="Token que te ha dado (rbd_…)"
            value={token} onChange={(e) => setToken(e.target.value)} style={{ flex: '1 1 220px' }}
          />
          <button className="btn primary" disabled={ocupado || !token.trim()} onClick={conectar}>
            <Icon name="link" size={13} /> {ocupado ? 'Probando…' : 'Conectar'}
          </button>
        </div>
      )}
      {!enDrive && ult && (
        <p className="dim" style={{ fontSize: 12, margin: '10px 0 0' }}>
          Última vez: {new Date(ult.at).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
          {ult.recuentos ? ` · en su app: ${ult.recuentos.formularios || 0} formularios, ${ult.recuentos.series || 0} series, ${ult.recuentos.molestias || 0} molestias` : ''}
        </p>
      )}
      {!enDrive && estado?.error && (
        <div className="notice err" style={{ marginTop: 10 }}>
          <Icon name="x" size={13} />
          <span style={{ fontSize: 12.5 }}>{estado.error}</span>
        </div>
      )}
    </div>
  )
}
