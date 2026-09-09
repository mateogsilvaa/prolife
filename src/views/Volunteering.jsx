import React, { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import { useStore, uid, slug, PALETTE } from '../lib/store.jsx'
import { dur, iso, addDays, startOfWeek } from '../lib/date.js'

/**
 * Voluntariado.
 *
 * Se parece a Trabajo —entidades con las que colaboras, cada una con su
 * carpeta— pero con una diferencia que manda sobre todo el diseño: aquí lo que
 * importa no es cuánto has trabajado, sino **poder demostrarlo**. Por eso la
 * unidad no es la entidad sino la *jornada*: un día concreto, sus horas, qué
 * hiciste y las fotos que lo acreditan.
 */

export function emptyEntidad(n = 0) {
  return {
    id: uid('vol'),
    name: '',
    org: '',
    color: PALETTE[(n + 5) % PALETTE.length],
    folder: '',
    notes: '',
    /** Horas a las que te has comprometido, si hay un compromiso. 0 = ninguno. */
    hoursGoal: 0,
    createdAt: Date.now(),
  }
}

/** Todo lo que hay que saber de una entidad: jornadas, horas y la última vez. */
export function volunteerStats(db, id) {
  const dias = (db.volunteerDays || []).filter((d) => d.volunteerId === id)
  const minutos = dias.reduce((a, d) => a + (Number(d.minutes) || 0), 0)
  const fotos = dias.reduce((a, d) => a + (d.photos?.length || 0), 0)
  const ordenados = [...dias].sort((a, b) => b.date.localeCompare(a.date))
  return {
    dias, minutos, fotos,
    ultima: ordenados[0] || null,
    sinFoto: dias.filter((d) => !d.photos?.length).length,
  }
}

export default function Volunteering() {
  const { db } = useStore()
  const [form, setForm] = useState(null)

  const entidades = db.volunteering || []
  const total = useMemo(() => {
    const dias = db.volunteerDays || []
    const desdeEsteAno = dias.filter((d) => d.date >= `${new Date().getFullYear()}-01-01`)
    return {
      minutos: dias.reduce((a, d) => a + (Number(d.minutes) || 0), 0),
      minutosAno: desdeEsteAno.reduce((a, d) => a + (Number(d.minutes) || 0), 0),
      jornadas: dias.length,
      sinFoto: dias.filter((d) => !d.photos?.length).length,
    }
  }, [db.volunteerDays])

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Voluntariado</div>
          <h2>Dónde colaboras</h2>
          <p>
            Cada jornada queda apuntada con su fecha, sus horas y las fotos que la acreditan. Es
            lo que hace falta cuando alguien te pide justificar las horas.
          </p>
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => setForm(emptyEntidad(entidades.length))}>
            <Icon name="plus" size={13} /> Entidad
          </button>
        </div>
      </div>

      {entidades.length > 0 && (
        <div className="grid-3" style={{ marginBottom: 22 }}>
          <div className="stat">
            <div className="eyebrow">Horas acumuladas</div>
            <div className="value num">{(total.minutos / 60).toFixed(1)}<span>h</span></div>
            <div className="delta dim">{total.jornadas} {total.jornadas === 1 ? 'jornada' : 'jornadas'} en total</div>
          </div>
          <div className="stat">
            <div className="eyebrow">Este año</div>
            <div className="value num">{(total.minutosAno / 60).toFixed(1)}<span>h</span></div>
            <div className="delta dim">desde el 1 de enero</div>
          </div>
          <div className="stat">
            <div className="eyebrow">Sin foto</div>
            <div className="value num" style={{ color: total.sinFoto ? 'var(--amber)' : '' }}>{total.sinFoto}</div>
            <div className="delta dim">
              {total.sinFoto ? 'jornadas que costaría demostrar' : 'todas están acreditadas'}
            </div>
          </div>
        </div>
      )}

      {entidades.length === 0 ? (
        <div className="empty">
          <div className="display">Todavía no hay ninguna</div>
          <p style={{ maxWidth: '44ch', margin: '0 auto' }}>
            Crea la entidad con la que colaboras —una ONG, una asociación, un programa de la
            universidad— y a partir de ahí ve apuntando cada jornada.
          </p>
          <button className="btn primary" onClick={() => setForm(emptyEntidad(0))}>
            <Icon name="plus" size={13} /> Crear la primera
          </button>
        </div>
      ) : (
        <div className="sub-grid">
          {entidades.map((v) => {
            const st = volunteerStats(db, v.id)
            return (
              <a key={v.id} className="sub-card" href={`#/voluntariado/${v.id}`}
                style={{ '--c': v.color, display: 'block', textDecoration: 'none' }}>
                <h4>{v.name}</h4>
                <div className="dim mono" style={{ fontSize: 11 }}>{v.org || '—'}</div>

                <div className="row" style={{ gap: 18, marginTop: 14 }}>
                  <div>
                    <div className="num" style={{ fontSize: 22 }}>{(st.minutos / 60).toFixed(1)}h</div>
                    <div className="eyebrow">acreditadas</div>
                  </div>
                  <div>
                    <div className="num" style={{ fontSize: 22 }}>{st.dias.length}</div>
                    <div className="eyebrow">{st.dias.length === 1 ? 'jornada' : 'jornadas'}</div>
                  </div>
                  <div>
                    <div className="num" style={{ fontSize: 22 }}>{st.fotos}</div>
                    <div className="eyebrow">{st.fotos === 1 ? 'foto' : 'fotos'}</div>
                  </div>
                </div>

                {v.hoursGoal > 0 && (
                  <>
                    <div className="meter" style={{ marginTop: 12 }}>
                      <i style={{
                        width: `${Math.min(100, (st.minutos / 60 / v.hoursGoal) * 100)}%`,
                        background: st.minutos / 60 >= v.hoursGoal ? 'var(--green)' : v.color,
                      }} />
                    </div>
                    <div className="dim" style={{ fontSize: 11, marginTop: 5 }}>
                      {(st.minutos / 60).toFixed(1)} de {v.hoursGoal} h comprometidas
                    </div>
                  </>
                )}

                <div className="row" style={{ gap: 8, marginTop: 12 }}>
                  {st.sinFoto > 0 && (
                    <span className="badge hot" title="Jornadas sin ninguna foto que las acredite">
                      {st.sinFoto} sin foto
                    </span>
                  )}
                  {st.ultima && <span className="dim" style={{ fontSize: 11 }}>última: {st.ultima.date}</span>}
                </div>
              </a>
            )
          })}
        </div>
      )}

      {form && <EntidadForm entidad={form} onClose={() => setForm(null)} />}
    </>
  )
}

/** Alta y edición de una entidad. La carpeta se propone sola a partir del nombre. */
export function EntidadForm({ entidad, onClose }) {
  const { db, update } = useStore()
  const [v, setV] = useState(entidad)
  const existe = (db.volunteering || []).some((x) => x.id === v.id)
  const set = (p) => setV((x) => ({ ...x, ...p }))

  const guardar = () => {
    if (!v.name.trim()) return
    const valor = { ...v, name: v.name.trim(), folder: v.folder || `Voluntariado/${slug(v.name.trim())}` }
    update((d) => {
      d.volunteering ||= []
      const i = d.volunteering.findIndex((x) => x.id === valor.id)
      if (i >= 0) d.volunteering[i] = valor
      else d.volunteering.push(valor)
    })
    onClose()
  }

  const borrar = () => {
    update((d) => {
      d.volunteering = (d.volunteering || []).filter((x) => x.id !== v.id)
      // Las jornadas de esa entidad se van con ella, y sus tramos de tiempo
      // también: si no, quedarían horas colgando de algo que ya no existe.
      const suyas = (d.volunteerDays || []).filter((x) => x.volunteerId === v.id).map((x) => 'vol_' + x.id)
      const fuera = new Set(suyas)
      d.volunteerDays = (d.volunteerDays || []).filter((x) => x.volunteerId !== v.id)
      d.sessions = d.sessions.filter((s) => !fuera.has(s.id))
    })
    onClose()
  }

  return (
    <Modal
      title={existe ? 'Editar entidad' : 'Nueva entidad de voluntariado'}
      onClose={onClose}
      foot={
        <>
          {existe && (
            <button className="btn ghost danger" onClick={borrar}>
              <Icon name="trash" size={13} /> Eliminar
            </button>
          )}
          <div className="spacer" />
          <button className="btn primary" onClick={guardar} disabled={!v.name.trim()}>Guardar</button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          <label>Nombre</label>
          <input className="input" autoFocus value={v.name} placeholder="Cruz Roja, banco de alimentos…"
            onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Programa o área</label>
            <input className="input" value={v.org} placeholder="Acompañamiento a mayores"
              onChange={(e) => set({ org: e.target.value })} />
          </div>
          <div className="field">
            <label>Horas comprometidas</label>
            <input className="input" type="number" min="0" value={v.hoursGoal || ''} placeholder="opcional"
              onChange={(e) => set({ hoursGoal: Number(e.target.value) || 0 })} />
          </div>
        </div>
        <div className="field">
          <label>Carpeta de las fotos</label>
          <input className="input mono" style={{ fontSize: 12 }} value={v.folder}
            placeholder={v.name ? `Voluntariado/${slug(v.name)}` : 'Voluntariado/…'}
            onChange={(e) => set({ folder: e.target.value })} />
          <p className="dim" style={{ fontSize: 11.5, margin: '5px 0 0' }}>
            Dentro de tu directorio de trabajo. Si lo dejas vacío se pone sola a partir del nombre.
          </p>
        </div>
        <div className="field">
          <label>Notas</label>
          <textarea className="textarea" value={v.notes} placeholder="Contacto, horario, a quién pedir el certificado…"
            onChange={(e) => set({ notes: e.target.value })} />
        </div>
      </div>
    </Modal>
  )
}
