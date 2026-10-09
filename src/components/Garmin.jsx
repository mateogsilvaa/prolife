import React, { useCallback, useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { useStore } from '../lib/store.jsx'

/**
 * La conexión con Garmin vive en la app de escritorio (Electron), porque es la
 * única que puede abrir la web de Garmin como un navegador de verdad. En la
 * tablet y en la web no hay botón: los datos llegan igual, en el `db.json`.
 */
const puente = () => (typeof window !== 'undefined' ? window.prolife?.garmin : null)

export function useGarmin() {
  const { toast } = useStore()
  const [estado, setEstado] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const disponible = !!puente()

  const refrescar = useCallback(() => {
    if (!puente()) return
    puente().estado().then(setEstado).catch(() => {})
  }, [])
  useEffect(() => { refrescar() }, [refrescar])

  const sincronizar = async () => {
    setOcupado(true)
    try {
      const r = await puente().sincronizar()
      if (r.ok) toast(`Garmin al día: ${r.dias} días${r.actividades ? ` y ${r.actividades} actividades` : ''}`)
      else toast(r.error || 'No se pudo hablar con Garmin', 'err')
    } finally {
      setOcupado(false)
      refrescar()
    }
  }

  const entrar = async () => {
    setOcupado(true)
    try {
      const r = await puente().entrar()
      if (r.ok) toast('Garmin conectado. Trayendo los últimos dos meses…')
    } finally {
      setOcupado(false)
      refrescar()
      // La primera tanda tarda un poco; se vuelve a mirar el estado al rato.
      setTimeout(refrescar, 20000)
    }
  }

  const salir = async () => {
    if (!confirm('¿Desconectar Garmin en este ordenador? Los datos ya traídos se quedan.')) return
    await puente().salir()
    refrescar()
  }

  return { disponible, estado, ocupado, sincronizar, entrar, salir }
}

export function GarminConnect({ g, compact }) {
  if (!g.disponible) {
    return (
      <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
        Garmin se conecta desde la app del ordenador (Ajustes → Garmin). Lo que traiga se ve también aquí.
      </p>
    )
  }
  return (
    <button className={`btn ${compact ? 'sm' : 'primary'}`} disabled={g.ocupado} onClick={g.entrar}>
      <Icon name="link" size={13} /> {g.ocupado ? 'Esperando a Garmin…' : 'Conectar Garmin'}
    </button>
  )
}

export function GarminSettings() {
  const g = useGarmin()
  const st = g.estado
  return (
    <div className="card">
      <div className="card-head">
        <h3>Garmin</h3>
        {st?.conectado && <span className="badge">conectado</span>}
      </div>
      <p className="dim" style={{ fontSize: 12.5, marginTop: 0, lineHeight: 1.6 }}>
        Sueño, pasos, pulso en reposo, estrés, Body Battery y las actividades de tu reloj, desde
        Garmin Connect. Se abre la página oficial de Garmin y entras allí, como en cualquier
        navegador: <b>prolife no ve ni guarda tu contraseña</b>, solo la sesión, en este ordenador.
        Se pone al día solo al abrir la app y cada dos horas; el reloj tiene que haber
        sincronizado antes con la app de Garmin del móvil.
      </p>
      {!g.disponible ? (
        <GarminConnect g={g} />
      ) : (
        <>
          <div className="row wrap" style={{ gap: 6 }}>
            {st?.conectado ? (
              <>
                <button className="btn primary" disabled={g.ocupado} onClick={g.sincronizar}>
                  <Icon name="refresh" size={13} /> {g.ocupado ? 'Trayendo…' : 'Sincronizar ahora'}
                </button>
                <a className="btn" href="#/salud"><Icon name="activity" size={13} /> Ver Salud</a>
                <button className="btn ghost" onClick={g.salir}>Desconectar</button>
              </>
            ) : (
              <GarminConnect g={g} />
            )}
          </div>
          {st?.ultima && (
            <p className="dim" style={{ fontSize: 12, margin: '10px 0 0' }}>
              Última vez: {new Date(st.ultima.at).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
              {st.ultima.dias} días, {st.ultima.actividades} actividades
              {st.ultima.fallos ? ` · ${st.ultima.fallos} cosas no se pudieron leer` : ''}
            </p>
          )}
          {st?.error && (
            <div className="notice err" style={{ marginTop: 10 }}>
              <Icon name="x" size={13} />
              <span style={{ fontSize: 12.5 }}>{st.error}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
