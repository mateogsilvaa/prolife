import React, { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import Foto from '../components/Foto.jsx'
import { EntidadForm, volunteerStats } from './Volunteering.jsx'
import { EventForm } from './Calendar.jsx'
import { useStore, uid } from '../lib/store.jsx'
import { api } from '../lib/api.js'
import { today, fmtDate, dur, parseIso } from '../lib/date.js'

/**
 * Una entidad de voluntariado y todas sus jornadas.
 *
 * La jornada es la unidad de todo esto: un día, sus horas, qué hiciste y las
 * fotos. Las fotos van a la carpeta real —`<carpeta>/<fecha>/`—, no dentro de
 * la base de datos: son archivos tuyos, tienen que poder abrirse desde el
 * explorador y viajar por Drive como todo lo demás.
 */
export default function VolunteerDetail({ id }) {
  const { db, update, toast } = useStore()
  const [editando, setEditando] = useState(false)
  const [jornada, setJornada] = useState(null)
  const [evento, setEvento] = useState(null)

  const v = (db.volunteering || []).find((x) => x.id === id)
  if (!v) {
    return (
      <div className="empty">
        <div className="display">Esa entidad ya no existe</div>
        <a className="btn" href="#/voluntariado">Volver</a>
      </div>
    )
  }

  const st = volunteerStats(db, v.id)
  const dias = useMemo(() => [...st.dias].sort((a, b) => b.date.localeCompare(a.date)), [st.dias])

  const porAno = useMemo(() => {
    const m = new Map()
    for (const d of st.dias) {
      const ano = d.date.slice(0, 4)
      m.set(ano, (m.get(ano) || 0) + (Number(d.minutes) || 0))
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [st.dias])

  const borrarJornada = (d) => {
    update((x) => {
      x.volunteerDays = (x.volunteerDays || []).filter((y) => y.id !== d.id)
      x.sessions = x.sessions.filter((s) => s.id !== 'vol_' + d.id)
    })
    toast('Jornada eliminada. Las fotos siguen en tu carpeta.')
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <a className="btn sm ghost" href="#/voluntariado"><Icon name="chevronL" size={13} /> Voluntariado</a>
      </div>

      <div className="page-head">
        <div>
          <div className="eyebrow row" style={{ gap: 6 }}>
            <span className="dot" style={{ background: v.color }} />
            {v.org || 'Voluntariado'}
          </div>
          <h2>{v.name}</h2>
        </div>
        <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={() => setJornada(nuevaJornada(v.id))}>
            <Icon name="plus" size={13} /> Apuntar jornada
          </button>
          <button className="btn" title="Poner una salida o turno en el calendario"
            onClick={() => setEvento({
              id: uid('ev'), title: v.name, date: today(), start: '', end: '',
              // La categoría de voluntariado ya viene puesta: es de lo que va esto.
              categoryId: db.categories.find((c) => c.area === 'volunteer')?.id || db.categories[0]?.id || null,
              notes: '', repeat: null, exceptions: [],
            })}>
            <Icon name="calendar" size={13} /> Al calendario
          </button>
          {v.folder && (
            <button className="btn" title="Abrir la carpeta de las fotos"
              onClick={() => api.openPath(v.folder).catch((e) => toast(e.message, 'err'))}>
              <Icon name="folder" size={13} />
            </button>
          )}
          <button className="btn ghost" title="Editar entidad" onClick={() => setEditando(true)}>
            <Icon name="settings" size={13} />
          </button>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 22 }}>
        <div className="stat">
          <div className="eyebrow">Horas acreditadas</div>
          <div className="value num">{(st.minutos / 60).toFixed(1)}<span>h</span></div>
          <div className="delta dim">
            {v.hoursGoal > 0 ? `de ${v.hoursGoal} h comprometidas` : `${st.dias.length} ${st.dias.length === 1 ? 'jornada' : 'jornadas'}`}
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">Fotos</div>
          <div className="value num">{st.fotos}</div>
          <div className="delta dim">
            {st.sinFoto ? `${st.sinFoto} ${st.sinFoto === 1 ? 'jornada' : 'jornadas'} sin ninguna` : 'todas las jornadas tienen'}
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">Última vez</div>
          <div className="value num" style={{ fontSize: 22 }}>{st.ultima ? fmtDate(st.ultima.date) : '—'}</div>
          <div className="delta dim">{st.ultima?.task || 'todavía nada'}</div>
        </div>
      </div>

      {st.sinFoto > 0 && (
        <div className="notice" style={{ marginBottom: 18 }}>
          <Icon name="image" size={13} />
          <span>
            Hay {st.sinFoto} {st.sinFoto === 1 ? 'jornada' : 'jornadas'} sin ninguna foto. Si alguna vez
            te piden justificar estas horas, esas son las que costará demostrar.
          </span>
        </div>
      )}

      {porAno.length > 1 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head"><h3>Por año</h3></div>
          <div className="list">
            {porAno.map(([ano, min]) => (
              <div key={ano} className="list-row">
                <span className="mono" style={{ width: 60 }}>{ano}</span>
                <div style={{ flex: 1 }}>
                  <div className="meter"><i style={{ width: `${(min / Math.max(...porAno.map((x) => x[1]))) * 100}%`, background: v.color }} /></div>
                </div>
                <span className="mono">{(min / 60).toFixed(1)} h</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3>Jornadas</h3>
          <span className="badge">{dias.length}</span>
        </div>

        {dias.length === 0 ? (
          <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
            Todavía no has apuntado ninguna. Cada una guarda el día, las horas y las fotos.
          </p>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {dias.map((d) => (
              <div key={d.id} className="card flat" style={{ padding: '12px 14px' }}>
                <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <strong style={{ fontSize: 13, textTransform: 'capitalize' }}>{fmtDate(d.date)}</strong>
                      <span className="mono dim" style={{ fontSize: 12 }}>{dur((Number(d.minutes) || 0) * 60, true)}</span>
                      {!d.photos?.length && <span className="badge" title="Sin foto que la acredite">sin foto</span>}
                    </div>
                    {d.task && <div style={{ fontSize: 12.5, marginTop: 3 }}>{d.task}</div>}
                    {d.notes && <div className="dim" style={{ fontSize: 12, marginTop: 3 }}>{d.notes}</div>}
                  </div>
                  <button className="btn ghost icon sm" title="Editar" onClick={() => setJornada(d)}>
                    <Icon name="edit" size={12} />
                  </button>
                  <button className="btn ghost icon sm" title="Eliminar" onClick={() => borrarJornada(d)}>
                    <Icon name="trash" size={12} />
                  </button>
                </div>

                {d.photos?.length > 0 && (
                  <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                    {d.photos.map((ruta) => (
                      <Foto key={ruta} ruta={ruta} alto={78}
                        onClick={() => api.openPath(ruta).catch(() => {})} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {editando && <EntidadForm entidad={v} onClose={() => setEditando(false)} />}
      {evento && <EventForm event={evento} onClose={() => setEvento(null)} />}
      {jornada && <JornadaForm entidad={v} jornada={jornada} onClose={() => setJornada(null)} />}
    </>
  )
}

export const nuevaJornada = (volunteerId) => ({
  id: uid('vd'), volunteerId, date: today(), minutes: 180, task: '', notes: '', photos: [], createdAt: Date.now(),
})

/**
 * Apuntar o corregir una jornada.
 *
 * Las fotos se suben en el momento a `<carpeta>/<fecha>/`, no al guardar: así
 * se ven antes de confirmar, y si te arrepientes de la jornada entera las
 * fotos ya están donde tienen que estar de todos modos.
 */
function JornadaForm({ entidad, jornada, onClose }) {
  const { db, update, toast } = useStore()
  const [d, setD] = useState(jornada)
  const [subiendo, setSubiendo] = useState(false)
  const existe = (db.volunteerDays || []).some((x) => x.id === d.id)
  const set = (p) => setD((x) => ({ ...x, ...p }))

  const carpeta = `${entidad.folder || 'Voluntariado'}/${d.date}`

  const subir = async (elegidos) => {
    // La lista se copia ANTES del primer `await`. El `<input>` se vacía nada más
    // volver del onChange —hace falta, o elegir dos veces el mismo archivo no
    // dispara nada— y vaciarlo vacía también su FileList: al reanudarse aquí ya
    // no quedaría ninguno, y la subida se iba en silencio con un 200 vacío.
    const files = [...(elegidos || [])]
    if (!files.length) return
    setSubiendo(true)
    try {
      await api.mkdir(carpeta)
      const r = await api.upload(carpeta, files)
      const nuevas = (r.files || []).map((f) => `${carpeta}/${f.name}`)
      set({ photos: [...(d.photos || []), ...nuevas.filter((x) => !(d.photos || []).includes(x))] })
      toast(`${nuevas.length} ${nuevas.length === 1 ? 'foto subida' : 'fotos subidas'}`)
    } catch (e) {
      toast(e.message, 'err')
    } finally {
      setSubiendo(false)
    }
  }

  const guardar = () => {
    const minutos = Math.max(0, Math.round(Number(d.minutes) || 0))
    const valor = { ...d, minutes: minutos, task: d.task.trim(), notes: d.notes.trim() }
    update((x) => {
      x.volunteerDays ||= []
      const i = x.volunteerDays.findIndex((y) => y.id === valor.id)
      if (i >= 0) x.volunteerDays[i] = valor
      else x.volunteerDays.push(valor)

      // La jornada cuenta como tiempo, igual que un entreno. El tramo va atado
      // a su id para que corregirla no deje horas duplicadas por ahí.
      const sid = 'vol_' + valor.id
      const si = x.sessions.findIndex((s) => s.id === sid)
      if (minutos > 0) {
        const inicio = parseIso(valor.date).getTime()
        const fila = {
          id: sid, area: 'volunteer', refId: valor.volunteerId, taskId: null,
          label: valor.task || entidad.name, date: valor.date,
          start: inicio, end: inicio + minutos * 60000, seconds: minutos * 60, source: 'manual',
        }
        if (si >= 0) x.sessions[si] = fila
        else x.sessions.push(fila)
      } else if (si >= 0) {
        x.sessions.splice(si, 1)
      }
    })
    onClose()
  }

  return (
    <Modal
      title={existe ? 'Editar jornada' : 'Apuntar jornada'}
      subtitle={entidad.name}
      onClose={onClose}
      foot={
        <>
          <div className="spacer" />
          <button className="btn primary" onClick={guardar} disabled={!d.date}>Guardar</button>
        </>
      }
    >
      <div className="stack">
        <div className="grid-2">
          <div className="field">
            <label>Día</label>
            <input className="input" type="date" value={d.date} max={today()}
              onChange={(e) => set({ date: e.target.value })} />
          </div>
          <div className="field">
            <label>Minutos</label>
            <input className="input" type="number" min="0" max="1440" value={d.minutes}
              onChange={(e) => set({ minutes: e.target.value })} />
            <p className="dim" style={{ fontSize: 11.5, margin: '5px 0 0' }}>
              {((Number(d.minutes) || 0) / 60).toFixed(1)} h
            </p>
          </div>
        </div>

        <div className="field">
          <label>Qué hiciste</label>
          <input className="input" value={d.task} placeholder="Reparto de alimentos, acompañamiento…"
            onChange={(e) => set({ task: e.target.value })} />
        </div>

        <div className="field">
          <label>Notas</label>
          <textarea className="textarea" value={d.notes} placeholder="Con quién, incidencias, a quién pedir la firma…"
            onChange={(e) => set({ notes: e.target.value })} />
        </div>

        <div className="field">
          <label>Fotos de ese día</label>
          <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
            {(d.photos || []).map((ruta) => (
              <div key={ruta} style={{ position: 'relative' }}>
                <Foto ruta={ruta} alto={78} />
                <button
                  className="btn ghost icon sm"
                  title="Quitar de la jornada (el archivo no se borra)"
                  style={{ position: 'absolute', top: 2, right: 2, background: 'var(--surface)' }}
                  onClick={() => set({ photos: d.photos.filter((x) => x !== ruta) })}
                >
                  <Icon name="x" size={11} />
                </button>
              </div>
            ))}
          </div>

          <label className="btn" style={{ cursor: 'pointer' }}>
            <Icon name="upload" size={13} /> {subiendo ? 'Subiendo…' : 'Añadir fotos'}
            <input type="file" accept="image/*" multiple hidden disabled={subiendo}
              onChange={(e) => { subir(e.target.files); e.target.value = '' }} />
          </label>

          <p className="dim" style={{ fontSize: 11.5, margin: '8px 0 0', lineHeight: 1.6 }}>
            Van a <span className="mono">{carpeta}</span>, dentro de tu carpeta de siempre. Son
            archivos normales: se abren desde el explorador y viajan por Drive como todo lo demás.
            Quitarlas de aquí no las borra del disco.
          </p>
        </div>
      </div>
    </Modal>
  )
}
