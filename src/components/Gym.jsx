import React, { useMemo, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import { useStore, uid } from '../lib/store.jsx'
import { api } from '../lib/api.js'
import { fmtDate, today } from '../lib/date.js'
import {
  exKey, e1rm, workSets, lastTimeOf, sessionFromDay, gymVolume, gymPRs, isPR, trackPRs, repsSummary,
  parseTime, fmtTime, paceOf, pdfToPages, parseRoutinePdf, exportHevy, exportStrong, downloadText,
} from '../lib/gym.js'

/* ================================================================ rutinas == */

const nuevoEjercicio = () => ({ id: uid('re'), name: '', sets: 3, reps: '8', rest: '', load: '', tempo: '', notes: '', material: '', video: '', block: '' })

/** Botón que lee uno o varios PDF de rutina y abre la revisión. */
export function ImportRoutine({ onReady, label = 'Importar PDF' }) {
  const { db, toast } = useStore()
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)

  const leer = async (files) => {
    const lista = [...(files || [])]
    if (!lista.length) return
    setBusy(true)
    try {
      const leidos = []
      for (const f of lista) leidos.push(parseRoutinePdf(await pdfToPages(f), f.name))
      const plan = leidos[0].plan
      // Si ya hay una rutina con ese nombre, los días nuevos se añaden a ella
      // (o sustituyen al día del mismo nombre): un PDF por día, un plan.
      const existente = (db.routines || []).find((r) => exKey(r.name) === exKey(plan))
      const base = existente ? structuredClone(existente) : { id: uid('rut'), name: plan, createdAt: Date.now(), days: [] }
      const meta = leidos.find((l) => l.planLargo) || leidos[0]
      base.fullName = meta.planLargo || base.fullName || ''
      if (meta.fechas?.length) { base.from = toIso(meta.fechas[0]); base.to = toIso(meta.fechas[meta.fechas.length - 1]) }
      if (meta.foco?.length) base.focus = meta.foco
      for (const l of leidos) {
        for (const d of l.days) {
          const i = base.days.findIndex((x) => exKey(x.name) === exKey(d.name))
          if (i >= 0) base.days[i] = { ...d, id: base.days[i].id }
          else base.days.push(d)
        }
      }
      const total = leidos.reduce((a, l) => a + l.days.reduce((b, d) => b + d.exercises.length, 0), 0)
      if (!total) toast('No he encontrado ejercicios en ese PDF: puedes escribir la rutina a mano.', 'err')
      onReady(base)
      // Se guarda también el PDF, junto a lo demás del deporte. Si falla no pasa nada.
      api.mkdir(`Deporte/Rutinas/${plan}`).then(() => api.upload(`Deporte/Rutinas/${plan}`, lista)).catch(() => {})
    } catch (e) {
      toast('No se pudo leer el PDF: ' + e.message, 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className="btn" disabled={busy} onClick={() => ref.current?.click()}>
        <Icon name="upload" size={13} /> {busy ? 'Leyendo…' : label}
      </button>
      <input ref={ref} type="file" accept="application/pdf" multiple hidden onChange={(e) => { leer(e.target.files); e.target.value = '' }} />
    </>
  )
}

const toIso = (dmy) => {
  const m = String(dmy).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''
}

/** Revisar y corregir una rutina antes de guardarla (o editarla después). */
export function RoutineEditor({ routine, onClose }) {
  const { db, update } = useStore()
  const [r, setR] = useState(() => structuredClone(routine))
  const [diaSel, setDiaSel] = useState(0)
  const existe = (db.routines || []).some((x) => x.id === r.id)
  const dia = r.days[diaSel]

  const cambiar = (fn) => setR((x) => { const y = structuredClone(x); fn(y); return y })
  const setEj = (i, patch) => cambiar((y) => Object.assign(y.days[diaSel].exercises[i], patch))

  const guardar = () => {
    const limpio = { ...r, days: r.days.map((d) => ({ ...d, exercises: d.exercises.filter((e) => e.name.trim()) })).filter((d) => d.name.trim()) }
    update((d) => {
      d.routines ||= []
      const i = d.routines.findIndex((x) => x.id === limpio.id)
      if (i >= 0) d.routines[i] = limpio
      else d.routines.push(limpio)
    })
    onClose()
  }

  return (
    <Modal
      wide
      title={existe ? 'Editar rutina' : 'Revisa la rutina antes de guardarla'}
      subtitle={r.fullName || undefined}
      onClose={onClose}
      foot={
        <>
          {existe && (
            <button className="btn ghost danger" onClick={() => {
              if (!confirm('¿Eliminar la rutina? Las sesiones ya apuntadas se quedan.')) return
              update((d) => { d.routines = (d.routines || []).filter((x) => x.id !== r.id) })
              onClose()
            }}><Icon name="trash" size={13} /> Eliminar</button>
          )}
          <div className="spacer" />
          <button className="btn primary" onClick={guardar}>Guardar rutina</button>
        </>
      }
    >
      <div className="stack" style={{ gap: 10 }}>
        <div className="grid-3">
          <div className="field"><label>Nombre</label><input className="input" value={r.name} onChange={(e) => cambiar((y) => { y.name = e.target.value })} /></div>
          <div className="field"><label>Desde</label><input className="input" type="date" value={r.from || ''} onChange={(e) => cambiar((y) => { y.from = e.target.value })} /></div>
          <div className="field"><label>Hasta</label><input className="input" type="date" value={r.to || ''} onChange={(e) => cambiar((y) => { y.to = e.target.value })} /></div>
        </div>

        <div className="row wrap" style={{ gap: 6 }}>
          {r.days.map((d, i) => (
            <button key={d.id} className={`chip${i === diaSel ? ' on' : ''}`} onClick={() => setDiaSel(i)}>{d.name || `Día ${i + 1}`} · {d.exercises.length}</button>
          ))}
          <button className="chip" onClick={() => { cambiar((y) => y.days.push({ id: uid('rd'), name: `Día ${y.days.length + 1}`, exercises: [nuevoEjercicio()] })); setDiaSel(r.days.length) }}>
            <Icon name="plus" size={10} /> Día
          </button>
        </div>

        {dia && (
          <>
            <div className="row" style={{ gap: 8 }}>
              <input className="input" style={{ maxWidth: 260 }} value={dia.name} onChange={(e) => cambiar((y) => { y.days[diaSel].name = e.target.value })} />
              <div className="spacer" />
              <button className="btn sm ghost danger" onClick={() => { cambiar((y) => y.days.splice(diaSel, 1)); setDiaSel(0) }}>Quitar este día</button>
            </div>
            <div className="table-wrap" style={{ maxHeight: '52vh', overflowY: 'auto' }}>
              <table className="tabla">
                <thead><tr><th>Bloque</th><th>Ejercicio</th><th>Series</th><th>Reps</th><th>Carga / indicación</th><th>Tempo</th><th>Técnica</th><th>Vídeo</th><th /></tr></thead>
                <tbody>
                  {dia.exercises.map((e, i) => (
                    <tr key={e.id}>
                      <td style={{ width: 60 }}><input className="input" value={e.block || ''} onChange={(ev) => setEj(i, { block: ev.target.value })} /></td>
                      <td style={{ minWidth: 180 }}><input className="input" value={e.name} onChange={(ev) => setEj(i, { name: ev.target.value })} /></td>
                      <td style={{ width: 56 }}><input className="input" type="number" min="1" value={e.sets} onChange={(ev) => setEj(i, { sets: Number(ev.target.value) })} /></td>
                      <td style={{ width: 80 }}><input className="input" value={e.reps} onChange={(ev) => setEj(i, { reps: ev.target.value })} /></td>
                      <td style={{ minWidth: 130 }}><input className="input" value={e.load || ''} onChange={(ev) => setEj(i, { load: ev.target.value })} /></td>
                      <td style={{ minWidth: 110 }}><input className="input" value={e.tempo || ''} onChange={(ev) => setEj(i, { tempo: ev.target.value })} /></td>
                      <td style={{ minWidth: 200 }}><input className="input" value={e.notes || ''} onChange={(ev) => setEj(i, { notes: ev.target.value })} /></td>
                      <td style={{ width: 40 }}>{e.video ? <button className="btn ghost icon sm" title={e.video} onClick={() => api.openUrl(e.video)}><Icon name="play" size={11} /></button> : ''}</td>
                      <td style={{ width: 30 }}><button className="btn ghost icon sm" onClick={() => cambiar((y) => y.days[diaSel].exercises.splice(i, 1))}><Icon name="x" size={11} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => cambiar((y) => y.days[diaSel].exercises.push(nuevoEjercicio()))}>
              <Icon name="plus" size={12} /> Ejercicio
            </button>
          </>
        )}
        <p className="dim" style={{ fontSize: 11.5, margin: 0 }}>
          Leído del PDF: revisa que cada cosa esté en su sitio. Si importas el PDF de otro día del mismo plan, se añade aquí como un día más.
        </p>
      </div>
    </Modal>
  )
}

/* ====================================================== sesión de gimnasio == */

/**
 * Registrar una sesión de gimnasio: con qué rutina y qué día, y por cada
 * ejercicio sus series con kg y repeticiones, las de calentamiento aparte, y
 * si te lo saltaste. Al lado, lo que hiciste la última vez.
 */
export function GymLog({ t, set }) {
  const { db } = useStore()
  const rutinas = (db.routines || []).filter((r) => r.days.length)
  const [rutId, setRutId] = useState(() => t.gym?.routineId || vigente(rutinas)?.id || '')
  const rutina = rutinas.find((r) => r.id === rutId)
  const [nuevo, setNuevo] = useState('')

  const empezar = (day) => set({ gym: sessionFromDay(db, rutina, day, t.date) })
  const libre = () => set({ gym: { routineId: null, dayId: null, exercises: [] } })

  if (!t.gym) {
    return (
      <div className="card flat" style={{ padding: '10px 12px', border: '1px dashed var(--line-strong)' }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Sesión de gimnasio</div>
        {rutinas.length ? (
          <>
            <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
              <select className="select" style={{ maxWidth: 240 }} value={rutId} onChange={(e) => setRutId(e.target.value)}>
                {rutinas.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <span className="dim" style={{ fontSize: 12 }}>¿Qué día has hecho?</span>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {rutina?.days.map((d) => (
                <button key={d.id} className="btn sm" onClick={() => empezar(d)}>{d.name} <span className="dim">· {d.exercises.length}</span></button>
              ))}
              <button className="btn sm ghost" onClick={libre}>Sin rutina</button>
            </div>
          </>
        ) : (
          <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
            <span className="dim" style={{ fontSize: 12.5 }}>Importa tu rutina en Atletismo → Gimnasio para apuntar los pesos por ejercicio.</span>
            <button className="btn sm ghost" onClick={libre}>Apuntar sin rutina</button>
          </div>
        )}
      </div>
    )
  }

  const g = t.gym
  const rut = (db.routines || []).find((r) => r.id === g.routineId)
  const day = rut?.days.find((d) => d.id === g.dayId)
  const setEx = (i, patch) => set({ gym: { ...g, exercises: g.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) } })
  const setSet = (i, k, patch) => setEx(i, { sets: g.exercises[i].sets.map((s, j) => (j === k ? { ...s, ...patch } : s)) })
  const hechos = g.exercises.filter((e) => !e.skipped && workSets(e).length).length

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <div className="eyebrow">{rut ? `${rut.name} · ${day?.name || ''}` : 'Gimnasio sin rutina'}</div>
        <span className="dim" style={{ fontSize: 11.5 }}>{hechos}/{g.exercises.length} ejercicios · volumen {Math.round(gymVolume(g)).toLocaleString('es')} kg</span>
        <div className="spacer" />
        <button className="btn sm ghost" onClick={() => { if (confirm('¿Quitar lo apuntado de gimnasio en esta sesión?')) set({ gym: null }) }}>Cambiar</button>
      </div>

      <div className="stack scroll-box" style={{ gap: 8, maxHeight: '48vh' }}>
        {g.exercises.map((e, i) => {
          const prev = lastTimeOf(db, e.key, t.date)
          const nuevoBloque = e.block && e.block !== g.exercises[i - 1]?.block
          return (
            <React.Fragment key={i}>
              {nuevoBloque && <div className="eyebrow" style={{ marginTop: 4 }}>Bloque {e.block}</div>}
              <div className={`ex-card${e.skipped ? ' skipped' : ''}`}>
                <div className="ex-head">
                  <strong>{e.name}</strong>
                  <span className="badge">{e.target}</span>
                  {e.load && <span className="dim" style={{ fontSize: 11.5 }}>{e.load}</span>}
                  <div className="spacer" />
                  {e.video && <button className="btn ghost icon sm" title="Ver el vídeo" onClick={() => api.openUrl(e.video)}><Icon name="play" size={11} /></button>}
                  <button className={`chip tiny${e.skipped ? ' on' : ''}`} onClick={() => setEx(i, { skipped: !e.skipped })}>{e.skipped ? 'Saltado' : 'Me lo salté'}</button>
                </div>
                {(e.tempo || e.routineNotes) && !e.skipped && (
                  <div className="dim" style={{ fontSize: 11.5, marginBottom: 6 }}>
                    {e.tempo && <>Tempo: {e.tempo}{e.routineNotes ? ' · ' : ''}</>}{e.routineNotes}
                  </div>
                )}
                {prev && !e.skipped && (
                  <div className="dim mono" style={{ fontSize: 11, marginBottom: 6 }}>
                    Última vez ({fmtDate(prev.date)}): {prev.sets.filter((s) => !s.warmup).map((s) => `${s.kg || 0}×${s.reps || 0}`).join(' · ')}
                  </div>
                )}
                {!e.skipped && (
                  <>
                    {e.sets.map((s, k) => {
                      const pr = !s.warmup && s.kg && s.reps && isPR(db, e.key, t.date, s.kg, s.reps)
                      const nWork = e.sets.slice(0, k + 1).filter((x) => !x.warmup).length
                      return (
                        <div key={k} className={`set-row${s.warmup ? ' warm' : ''}`}>
                          <span className="n" title={s.warmup ? 'Calentamiento' : `Serie ${nWork}`}>{s.warmup ? 'W' : nWork}</span>
                          <input className="input" inputMode="decimal" placeholder="kg" value={s.kg} onChange={(ev) => setSet(i, k, { kg: ev.target.value })} />
                          <input className="input" inputMode="numeric" placeholder="reps" value={s.reps} onChange={(ev) => setSet(i, k, { reps: ev.target.value })} />
                          <button className={`chip tiny${s.warmup ? ' on' : ''}`} title="Serie de calentamiento" onClick={() => setSet(i, k, { warmup: !s.warmup })}>W</button>
                          {pr ? <span className="pr" title="Marca personal (1RM estimado)">★</span>
                            : <button className="btn ghost icon sm" title="Quitar serie" onClick={() => setEx(i, { sets: e.sets.filter((_, j) => j !== k) })}><Icon name="x" size={10} /></button>}
                        </div>
                      )
                    })}
                    <div className="row" style={{ gap: 6, marginTop: 4 }}>
                      <button className="btn sm ghost" onClick={() => setEx(i, { sets: [...e.sets, { ...(e.sets.filter((x) => !x.warmup).slice(-1)[0] || { kg: '', reps: '' }), warmup: false }] })}>+ serie</button>
                      <button className="btn sm ghost" onClick={() => setEx(i, { sets: [{ kg: '', reps: '', warmup: true }, ...e.sets] })}>+ calentamiento</button>
                      <input className="input" style={{ flex: 1, padding: '4px 8px', fontSize: 12 }} placeholder="Nota (sensaciones, técnica…)" value={e.notes || ''} onChange={(ev) => setEx(i, { notes: ev.target.value })} />
                    </div>
                  </>
                )}
              </div>
            </React.Fragment>
          )
        })}
      </div>

      <div className="row" style={{ gap: 6 }}>
        <input className="input" placeholder="Añadir otro ejercicio…" value={nuevo} onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && nuevo.trim()) { anadir(); } }} />
        <button className="btn sm" disabled={!nuevo.trim()} onClick={anadir}><Icon name="plus" size={12} /></button>
      </div>
    </div>
  )

  function anadir() {
    const name = nuevo.trim()
    const prev = lastTimeOf(db, exKey(name), t.date)
    set({ gym: { ...g, exercises: [...g.exercises, {
      key: exKey(name), name, target: 'extra', notes: '', skipped: false,
      sets: (prev?.sets.filter((s) => !s.warmup) || [{ kg: '', reps: '' }]).map((s) => ({ kg: s.kg, reps: s.reps, warmup: false })),
    }] } })
    setNuevo('')
  }
}

/** La rutina que toca por fechas; si no, la más reciente. */
function vigente(rutinas) {
  const hoy = today()
  return rutinas.find((r) => r.from && r.to && r.from <= hoy && hoy <= r.to) || [...rutinas].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0]
}

/* ============================================================== series == */

/** Los tiempos de cada repetición de unas series: distancia, tiempo y descanso. */
export function TrackLog({ t, set }) {
  const reps = t.reps || []
  const ultimaDist = reps[reps.length - 1]?.dist || ''
  const setRep = (i, patch) => set({ reps: reps.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  const anadir = (n = 1) => set({ reps: [...reps, ...Array.from({ length: n }, () => ({ dist: ultimaDist || '300', time: '', rest: reps[reps.length - 1]?.rest || '' }))] })
  const tiempos = reps.map((r) => parseTime(r.time)).filter((x) => x)

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 8 }}>
        <div className="eyebrow">Tiempos de las series</div>
        {tiempos.length > 0 && <span className="dim" style={{ fontSize: 11.5 }}>{repsSummary(reps)}</span>}
      </div>
      {reps.length > 0 && (
        <div className="rep-row dim" style={{ fontSize: 10.5 }}>
          <span>#</span><span>metros</span><span>tiempo</span><span>descanso</span><span />
        </div>
      )}
      {reps.map((r, i) => {
        const s = parseTime(r.time)
        return (
          <div key={i} className="rep-row">
            <span className="mono dim" style={{ fontSize: 11.5, textAlign: 'center' }}>{i + 1}</span>
            <input className="input" inputMode="numeric" value={r.dist} onChange={(e) => setRep(i, { dist: e.target.value })} />
            <input className="input" placeholder="48.2 o 1:05.3" value={r.time} onChange={(e) => setRep(i, { time: e.target.value })}
              title={s ? `${fmtTime(s)} · ${paceOf(Number(r.dist), s) || ''}` : ''} />
            <input className="input" placeholder={'90"'} value={r.rest || ''} onChange={(e) => setRep(i, { rest: e.target.value })} />
            <button className="btn ghost icon sm" onClick={() => set({ reps: reps.filter((_, j) => j !== i) })}><Icon name="x" size={10} /></button>
          </div>
        )
      })}
      <div className="row wrap" style={{ gap: 6 }}>
        <button className="btn sm" onClick={() => anadir(1)}><Icon name="plus" size={11} /> Repetición</button>
        {!reps.length && [4, 6, 8, 10].map((n) => <button key={n} className="btn sm ghost" onClick={() => anadir(n)}>{n} reps</button>)}
      </div>
    </div>
  )
}

/* ========================================================== pestañas == */

export function GymTab({ onOpenTraining }) {
  const { db } = useStore()
  const [editar, setEditar] = useState(null)
  const prs = useMemo(() => gymPRs(db), [db])
  const sesiones = useMemo(() => [...db.training].filter((t) => t.gym).sort((a, b) => b.date.localeCompare(a.date)), [db.training])
  const mes = today().slice(0, 7)
  const sesMes = sesiones.filter((t) => t.date.startsWith(mes))
  const prsMes = prs.filter((p) => p.best1rmDate.startsWith(mes)).length
  const volMes = sesMes.reduce((a, t) => a + gymVolume(t.gym), 0)
  const saltados = {}
  for (const t of sesiones.slice(0, 20)) for (const e of t.gym.exercises || []) if (e.skipped) saltados[e.name] = (saltados[e.name] || 0) + 1
  const masSaltados = Object.entries(saltados).sort((a, b) => b[1] - a[1]).slice(0, 4)

  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 6 }}>
        <ImportRoutine onReady={setEditar} />
        <button className="btn ghost" onClick={() => setEditar({ id: uid('rut'), name: 'Rutina nueva', createdAt: Date.now(), days: [{ id: uid('rd'), name: 'Día 1', exercises: [nuevoEjercicio()] }] })}>
          <Icon name="plus" size={13} /> Rutina a mano
        </button>
        <div className="spacer" />
        <button className="btn ghost" disabled={!sesiones.length} title="Una fila por serie, con las columnas de la exportación de Hevy"
          onClick={() => downloadText(`prolife-gimnasio-hevy-${today()}.csv`, exportHevy(db))}>
          <Icon name="download" size={13} /> CSV Hevy
        </button>
        <button className="btn ghost" disabled={!sesiones.length} title="Formato Strong: el que Hevy acepta al importar (Ajustes → Exportar e importar → Importar de Strong)"
          onClick={() => downloadText(`prolife-gimnasio-strong-${today()}.csv`, exportStrong(db))}>
          <Icon name="download" size={13} /> Importable en Hevy
        </button>
      </div>

      <div className="grid-4">
        <div className="stat"><div className="eyebrow">Sesiones este mes</div><div className="value num">{sesMes.length}</div><div className="delta dim">{sesiones.length} en total</div></div>
        <div className="stat"><div className="eyebrow">Volumen este mes</div><div className="value num">{Math.round(volMes / 1000)}<span>t</span></div><div className="delta dim">kg × reps, sin calentamiento</div></div>
        <div className="stat"><div className="eyebrow">Marcas este mes</div><div className="value num" style={{ color: prsMes ? 'var(--amber)' : '' }}>{prsMes}</div><div className="delta dim">ejercicios con 1RM estimado récord</div></div>
        <div className="stat"><div className="eyebrow">Lo que más te saltas</div><div className="value num" style={{ fontSize: 18 }}>{masSaltados[0]?.[0] || '—'}</div><div className="delta dim">{masSaltados[0] ? `${masSaltados[0][1]} veces en las últimas 20` : 'nada'}</div></div>
      </div>

      <div className="split wide-left">
        <div className="card">
          <div className="card-head"><h3>Marcas personales</h3><span className="dim" style={{ fontSize: 11.5 }}>1RM estimado con Epley · sin calentamientos</span></div>
          {prs.length ? (
            <div className="table-wrap scroll-box">
              <table className="tabla">
                <thead><tr><th>Ejercicio</th><th className="r">Máximo</th><th className="r">1RM est.</th><th>Evolución</th><th className="r">Sesiones</th><th className="r">Última</th></tr></thead>
                <tbody>
                  {prs.map((p) => (
                    <tr key={p.key}>
                      <td>{p.name}</td>
                      <td className="r mono">{p.maxKg} kg×{p.maxKgReps}</td>
                      <td className="r mono" title={`el ${fmtDate(p.best1rmDate, { absolute: true })}`}>{Math.round(p.best1rm)} kg</td>
                      <td style={{ width: 110 }}><Mini valores={p.history.map((h) => h.e1rm)} /></td>
                      <td className="r mono">{p.sessions}</td>
                      <td className="r dim">{fmtDate(p.last)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Cuando apuntes sesiones con pesos, aquí saldrán tus marcas y cómo progresan.</p>}
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Rutinas</h3></div>
            {(db.routines || []).length ? (
              <div className="list">
                {db.routines.map((r) => (
                  <div key={r.id} className="list-row click" onClick={() => setEditar(r)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13 }}>{r.name}</div>
                      <div className="dim" style={{ fontSize: 11.5 }}>
                        {r.days.map((d) => d.name).join(' · ')}
                        {r.from ? ` · ${fmtDate(r.from, { absolute: true })} → ${fmtDate(r.to, { absolute: true })}` : ''}
                      </div>
                    </div>
                    <Icon name="edit" size={12} />
                  </div>
                ))}
              </div>
            ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Importa el PDF de tu plan: se convierte en una rutina por días, con series, repeticiones, tempo, técnica y vídeo de cada ejercicio.</p>}
          </div>

          <div className="card">
            <div className="card-head"><h3>Últimas sesiones</h3></div>
            {sesiones.length ? (
              <div className="list scroll-box" style={{ maxHeight: 240 }}>
                {sesiones.slice(0, 15).map((t) => {
                  const r = (db.routines || []).find((x) => x.id === t.gym.routineId)
                  const d = r?.days.find((x) => x.id === t.gym.dayId)
                  const sk = (t.gym.exercises || []).filter((e) => e.skipped).length
                  return (
                    <div key={t.id} className="list-row click" onClick={() => onOpenTraining(t)}>
                      <span className="dim" style={{ width: 70 }}>{fmtDate(t.date)}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>{d?.name || r?.name || 'Libre'}</span>
                      {sk > 0 && <span className="badge">{sk} saltados</span>}
                      <span className="mono dim">{Math.round(gymVolume(t.gym) / 100) / 10} t</span>
                    </div>
                  )
                })}
              </div>
            ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Nada todavía.</p>}
          </div>
        </div>
      </div>

      {editar && <RoutineEditor routine={editar} onClose={() => setEditar(null)} />}
    </div>
  )
}

export function TrackTab({ onOpenTraining }) {
  const { db } = useStore()
  const prs = useMemo(() => trackPRs(db), [db])
  const [dist, setDist] = useState(null)
  const sel = prs.find((p) => p.dist === dist) || prs[0]
  const sesiones = [...db.training].filter((t) => (t.reps || []).length).sort((a, b) => b.date.localeCompare(a.date))

  if (!prs.length) {
    return (
      <div className="empty">
        <div className="display">Sin tiempos todavía</div>
        <p style={{ maxWidth: '50ch', margin: '0 auto' }}>
          Al apuntar un entreno de series, en el formulario sale «Tiempos de las series»: metros y
          tiempo de cada repetición. Con eso aquí verás tus marcas por distancia y cómo bajan.
        </p>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="split wide-left">
        <div className="card">
          <div className="card-head"><h3>Marcas por distancia</h3><span className="dim" style={{ fontSize: 11.5 }}>toca una para ver su evolución</span></div>
          <div className="table-wrap">
            <table className="tabla">
              <thead><tr><th>Distancia</th><th className="r">Mejor</th><th className="r">Ritmo</th><th className="r">Media</th><th className="r">Reps</th><th className="r">Cuándo</th></tr></thead>
              <tbody>
                {prs.map((p) => (
                  <tr key={p.dist} className="click" style={{ cursor: 'pointer', background: sel?.dist === p.dist ? 'var(--surface-2)' : '' }} onClick={() => setDist(p.dist)}>
                    <td><b>{p.dist} m</b></td>
                    <td className="r mono">{fmtTime(p.best)}</td>
                    <td className="r mono dim">{paceOf(p.dist, p.best)}</td>
                    <td className="r mono">{fmtTime(p.avg)}</td>
                    <td className="r mono">{p.count}</td>
                    <td className="r dim">{fmtDate(p.bestDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>{sel.dist} m: sesión a sesión</h3><span className="dim" style={{ fontSize: 11.5 }}>mejor y media</span></div>
          <Mini valores={sel.history.map((h) => -h.best)} alto={90} />
          <div className="list" style={{ marginTop: 8 }}>
            {[...sel.history].reverse().slice(0, 6).map((h) => (
              <div key={h.date} className="list-row">
                <span className="dim" style={{ width: 70 }}>{fmtDate(h.date)}</span>
                <span className="mono">{h.n}× · mejor {fmtTime(h.best)} · media {fmtTime(h.avg)}</span>
                {h.best === sel.best && <span className="pr">★ marca</span>}
              </div>
            ))}
          </div>
          <p className="dim" style={{ fontSize: 11, margin: '6px 0 0' }}>La línea sube cuando bajas el tiempo.</p>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Sesiones de series</h3></div>
        <div className="list scroll-box" style={{ maxHeight: 260 }}>
          {sesiones.map((t) => (
            <div key={t.id} className="list-row click" onClick={() => onOpenTraining(t)}>
              <span className="dim" style={{ width: 70 }}>{fmtDate(t.date)}</span>
              <span style={{ width: 90 }}>{t.type}</span>
              <span className="mono" style={{ flex: 1, minWidth: 0, fontSize: 12 }}>{repsSummary(t.reps)}</span>
              {t.rpe && <span className="badge">RPE {t.rpe}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Una línea pequeña de evolución. */
export function Mini({ valores, alto = 26 }) {
  const v = valores.filter((x) => Number.isFinite(x))
  if (v.length < 2) return <span className="dim" style={{ fontSize: 11 }}>—</span>
  const min = Math.min(...v)
  const max = Math.max(...v)
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * 100},${100 - ((x - min) / (max - min || 1)) * 100}`).join(' ')
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: alto }}>
      <polyline points={pts} fill="none" stroke="var(--green)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export { e1rm }
