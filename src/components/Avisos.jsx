import React, { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { useStore } from '../lib/store.jsx'
import { api } from '../lib/api.js'
import { AVISOS_POR_DEFECTO } from '../../server/avisos.js'
import {
  esEscritorio, esNativo, esIOS, enPantallaDeInicio, pushDisponible, suscripcionActual, activarPush, desactivarPush,
  permisoLocal, pedirPermisoLocal, programarLocales,
} from '../lib/avisosCliente.js'

const TIPOS = [
  ['entregas', 'Entregas evaluables', 'la tarde antes'],
  ['examenes', 'Exámenes', '3 días y 1 día antes'],
  ['competiciones', 'Competiciones', '2 días y 1 día antes'],
  ['asistencia', 'Asistencia sin marcar', 'en el repaso de la noche'],
  ['entreno', 'Entreno sin apuntar', 'los días que sueles entrenar'],
  ['diario', 'Diario de trabajo', 'los días laborables, si lo usas'],
  ['eventos', 'Eventos del calendario', '30 min antes'],
]

/** Ajustes → Avisos: qué te avisa la app y en qué aparatos. */
export function AvisosSettings() {
  const { db, update, toast } = useStore()
  const aj = { ...AVISOS_POR_DEFECTO, ...(db.settings.avisos || {}) }
  const set = (p) => update((d) => { d.settings.avisos = { ...AVISOS_POR_DEFECTO, ...(d.settings.avisos || {}), ...p } })
  const [sub, setSub] = useState(null)
  const [local, setLocal] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    suscripcionActual().then(setSub).catch(() => {})
    if (esNativo()) permisoLocal().then(setLocal).catch(() => {})
  }, [])

  const activarAqui = async () => {
    setOcupado(true)
    try {
      if (esNativo()) {
        const p = await pedirPermisoLocal()
        setLocal(p)
        if (p !== 'granted') throw new Error('Sin permiso de notificaciones: dáselo en los ajustes de Android → Apps → prolife.')
        const n = await programarLocales(db)
        toast(`Avisos activados en la tablet: ${n} programados para los próximos días`)
      } else {
        await activarPush(db, update)
        setSub(await suscripcionActual())
        toast('Avisos activados en este aparato. Te llegarán cuando el ordenador tenga prolife abierta.')
      }
    } catch (e) {
      toast(e.message, 'err')
    } finally {
      setOcupado(false)
    }
  }

  const probar = async () => {
    try {
      const r = await api.avisoPrueba()
      toast(`Aviso de prueba enviado${r.push ? ` (también a ${r.push} ${r.push === 1 ? 'aparato' : 'aparatos'})` : ''}`)
    } catch (e) {
      toast(e.message, 'err')
    }
  }

  const aparatos = db.pushSubs || []

  return (
    <div className="card">
      <div className="card-head">
        <h3>Avisos</h3>
        <label className="row" style={{ gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={aj.activos} onChange={(e) => set({ activos: e.target.checked })} /> Activados
        </label>
      </div>

      <div className="grid-2" style={{ marginBottom: 12 }}>
        <div className="field"><label>Resumen de la mañana</label><input className="input" type="time" value={aj.resumen} onChange={(e) => set({ resumen: e.target.value || '08:00' })} /></div>
        <div className="field"><label>Repaso de la noche</label><input className="input" type="time" value={aj.noche} onChange={(e) => set({ noche: e.target.value || '21:30' })} /></div>
      </div>
      <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
        {TIPOS.map(([k, l, cuando]) => (
          <label key={k} className="row" style={{ gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!aj[k]} onChange={(e) => set({ [k]: e.target.checked })} />
            <span style={{ flex: 1 }}>{l}</span>
            <span className="dim" style={{ fontSize: 11.5 }}>{cuando}</span>
          </label>
        ))}
      </div>

      <hr className="hr" style={{ margin: '4px 0 12px' }} />
      <div className="eyebrow" style={{ marginBottom: 6 }}>En este aparato</div>
      {esEscritorio() ? (
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="dim" style={{ fontSize: 12.5, flex: 1 }}>Notificaciones de Windows, mientras la app está abierta (también minimizada).</span>
          <button className="btn sm" onClick={probar}><Icon name="sparkle" size={12} /> Probar</button>
        </div>
      ) : esNativo() ? (
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="dim" style={{ fontSize: 12.5, flex: 1 }}>
            {local === 'granted' ? 'Activados: la tablet programa los avisos de los próximos días y suenan aunque la app esté cerrada.' : 'La tablet programa sus propios avisos y suenan aunque el ordenador esté apagado.'}
          </span>
          <button className="btn sm primary" disabled={ocupado} onClick={activarAqui}>{local === 'granted' ? 'Reprogramar' : 'Activar en la tablet'}</button>
        </div>
      ) : !pushDisponible() ? (
        <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>Este navegador no admite avisos.</p>
      ) : esIOS() && !enPantallaDeInicio() ? (
        <div className="notice"><Icon name="alert" size={13} /><span style={{ fontSize: 12.5 }}>En el iPhone, Apple solo deja mandar avisos a la web añadida a la pantalla de inicio. Compartir → «Añadir a pantalla de inicio», ábrela desde el icono y vuelve aquí.</span></div>
      ) : (
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="dim" style={{ fontSize: 12.5, flex: 1 }}>
            {sub ? 'Activados en este aparato.' : 'Avisos push en este aparato.'} Los manda el ordenador cuando tiene prolife abierta;
            los exámenes, entregas y competiciones te llegan además siempre por Google Calendar.
          </span>
          {sub
            ? <button className="btn sm ghost" onClick={async () => { await desactivarPush(update); setSub(null) }}>Desactivar</button>
            : <button className="btn sm primary" disabled={ocupado} onClick={activarAqui}>Activar en este {esIOS() ? 'iPhone' : 'aparato'}</button>}
        </div>
      )}

      {aparatos.length > 0 && (
        <div className="dim" style={{ fontSize: 12, marginTop: 10 }}>
          Reciben avisos push: {aparatos.map((a) => a.device).join(', ')}.
        </div>
      )}
    </div>
  )
}

/**
 * En la tablet, cada vez que cambian los datos se vuelven a programar los
 * avisos (con un rato de espera para no hacerlo a cada tecla).
 */
export function useAvisosTablet() {
  const { db } = useStore()
  useEffect(() => {
    if (!esNativo() || !db) return
    const t = setTimeout(() => { programarLocales(db).catch(() => {}) }, 4000)
    return () => clearTimeout(t)
  }, [db])
}
