import React, { useMemo, useState } from 'react'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import { Mini } from './Gym.jsx'
import { useStore, uid } from '../lib/store.jsx'
import { fmtDate, today } from '../lib/date.js'
import { hrs } from '../lib/health.js'
import {
  EVENTS, isField, windMatters, parseMark, fmtMark, newCompetition, allResults, personalBests, wasPB,
  arrival, whatInfluences, upcoming,
} from '../lib/competitions.js'

/** Atletismo → Competiciones: las que vienen, tus marcas y qué influye en ellas. */
export function CompetitionsTab() {
  const { db } = useStore()
  const [form, setForm] = useState(null)
  const [prueba, setPrueba] = useState(null)
  const pbs = useMemo(() => personalBests(db), [db])
  // Solo lo que ya tiene marca o puesto: lo que viene está en «Próximas».
  const resultados = useMemo(() => allResults(db).filter((r) => r.value != null || r.position), [db])
  const proximas = useMemo(() => upcoming(db, 120), [db])
  const influye = useMemo(() => whatInfluences(db), [db])
  const sel = pbs.find((p) => p.event === prueba) || pbs[0]
  const pasadas = [...(db.competitions || [])].filter((c) => c.date < today() || (c.results || []).length).sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      <div className="row" style={{ gap: 6, marginBottom: 16 }}>
        <button className="btn primary" onClick={() => setForm(newCompetition())}><Icon name="plus" size={13} /> Competición</button>
        <span className="dim solo-escritorio" style={{ fontSize: 12 }}>Apunta las que vienen para tenerlas en el calendario y los avisos; tras competir, añade tus marcas.</span>
      </div>

      <div className="fila fila-2">
        <div className="card">
          <div className="card-head"><h3>Próximas</h3><span className="badge">{proximas.length}</span></div>
          <div className="fill">
            {proximas.length ? proximas.map((c) => (
              <div key={c.id} className="list-row click" onClick={() => setForm(c)}>
                <div className="cuenta" style={{ color: c.dias <= 7 ? 'var(--accent)' : '' }}>
                  <div className="num">{c.dias}</div><div className="eyebrow">{c.dias === 1 ? 'día' : 'días'}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name || 'Competición'}</div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    {fmtDate(c.date, { absolute: true })}{c.time ? ` · ${c.time}` : ''}{c.place ? ` · ${c.place}` : ''} · {c.indoor ? 'pista cubierta' : 'aire libre'}
                  </div>
                  {(c.results || []).length > 0 && <div className="dim" style={{ fontSize: 12 }}>{c.results.map((r) => r.event).join(' · ')}</div>}
                </div>
              </div>
            )) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Ninguna apuntada.</p>}
            {proximas[0] && proximas[0].dias <= 10 && (
              <div className="notice" style={{ marginTop: 10 }}>
                <Icon name="clock" size={13} />
                <span style={{ fontSize: 12.5 }}>
                  Faltan {proximas[0].dias} días: la semana antes conviene bajar volumen (no intensidad) y priorizar el sueño.
                  Mira «Cómo llegas hoy» en Salud los días previos.
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Tus marcas</h3><span className="dim" style={{ fontSize: 11.5 }}>MMP = mejor personal · MMT = de esta temporada</span></div>
          <div className="table-wrap fill">
            {pbs.length ? (
              <table className="tabla">
                <thead><tr><th>Prueba</th><th className="r">MMP</th><th className="r">Fecha</th><th className="r">MMT</th><th className="r">Veces</th><th>Progresión</th></tr></thead>
                <tbody>
                  {pbs.map((p) => (
                    <tr key={p.event} style={{ cursor: 'pointer', background: sel?.event === p.event ? 'var(--surface-2)' : '' }} onClick={() => setPrueba(p.event)}>
                      <td><b>{p.event}</b></td>
                      <td className="r mono">{fmtMark(p.event, p.pb?.value)}</td>
                      <td className="r dim">{p.pb ? fmtDate(p.pb.date, { absolute: true }) : '—'}</td>
                      <td className="r mono">{fmtMark(p.event, p.sb?.value)}</td>
                      <td className="r mono">{p.n}</td>
                      <td style={{ width: 90 }}><Mini valores={p.history.map((h) => (isField(p.event) ? h.value : -h.value))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Cuando apuntes tus primeras marcas, aquí saldrán tus mejores marcas y cómo progresan.</p>}
          </div>
        </div>
      </div>

      <div className="fila fila-2">
        <div className="card">
          <div className="card-head"><h3>Resultados</h3><span className="badge">{resultados.length}</span></div>
          <div className="table-wrap fill scroll-box" style={{ maxHeight: 360 }}>
            {resultados.length ? (
              <table className="tabla">
                <thead><tr><th>Fecha</th><th>Competición</th><th>Prueba</th><th className="r">Marca</th><th className="r">Viento</th><th className="r">Puesto</th><th className="r">Sueño</th><th className="r">CMJ</th></tr></thead>
                <tbody>
                  {resultados.map((r, i) => {
                    const a = arrival(db, r.date)
                    return (
                      <tr key={i} style={{ cursor: 'pointer' }} onClick={() => setForm(r.comp)}>
                        <td className="dim">{fmtDate(r.date, { absolute: true })}</td>
                        <td>{r.comp.name}{r.comp.indoor ? ' (PC)' : ''}</td>
                        <td>{r.event}{r.round ? <span className="dim"> · {r.round}</span> : ''}</td>
                        <td className="r mono">
                          {fmtMark(r.event, r.value)}{wasPB(db, r) && <span className="pr" title="Mejor marca personal en ese momento"> MMP</span>}
                        </td>
                        <td className="r mono" style={{ color: r.ventoso ? 'var(--amber)' : '' }}>{r.wind || ''}</td>
                        <td className="r mono">{r.position || ''}</td>
                        <td className="r mono">{a.sueno ? hrs(a.sueno * 3600) : '—'}</td>
                        <td className="r mono">{a.cmj ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Sin resultados todavía.</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Qué influye en tus marcas</h3><span className="dim" style={{ fontSize: 11.5 }}>% respecto a tu MMP de cada prueba</span></div>
          <div className="fill">
            {influye.factores.map((f) => (
              <div key={f.k} className="corr">
                {f.rendAlto == null ? (
                  <div className="dim" style={{ fontSize: 12.5 }}>{f.nombre[0].toUpperCase() + f.nombre.slice(1)}: hacen falta 5 marcas con ese dato (hay {f.n}).</div>
                ) : (
                  <>
                    <strong style={{ fontSize: 13 }}>{f.nombre[0].toUpperCase() + f.nombre.slice(1)}</strong>
                    <div style={{ fontSize: 12.5 }}>
                      Con {f.altoDesde} o más rindes al <b>{f.rendAlto.toFixed(1)} %</b> de tu mejor marca; con {f.bajoHasta} o menos, al <b>{f.rendBajo.toFixed(1)} %</b>.
                    </div>
                  </>
                )}
              </div>
            ))}
            {sel && sel.history.length >= 2 && (
              <>
                <div className="eyebrow" style={{ marginTop: 10 }}>{sel.event}: marca a marca</div>
                <Mini valores={sel.history.map((h) => (isField(sel.event) ? h.value : -h.value))} alto={70} />
                <div className="dim" style={{ fontSize: 11 }}>Sube cuando mejoras.</div>
              </>
            )}
          </div>
        </div>
      </div>

      {pasadas.length > 0 && (
        <details className="card">
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Todas las competiciones ({(db.competitions || []).length})</summary>
          <div className="list" style={{ marginTop: 8 }}>
            {[...(db.competitions || [])].sort((a, b) => b.date.localeCompare(a.date)).map((c) => (
              <div key={c.id} className="list-row click" onClick={() => setForm(c)}>
                <span className="dim" style={{ width: 90 }}>{fmtDate(c.date, { absolute: true })}</span>
                <span style={{ flex: 1 }}>{c.name}</span>
                <span className="dim" style={{ fontSize: 12 }}>{(c.results || []).map((r) => `${r.event} ${r.mark || ''}`).join(' · ')}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {form && <CompetitionForm comp={form} onClose={() => setForm(null)} />}
    </>
  )
}

/** Alta y edición de una competición con sus pruebas y marcas. */
export function CompetitionForm({ comp, onClose }) {
  const { db, update } = useStore()
  const [c, setC] = useState(() => structuredClone(comp))
  const [comoEntreno, setComoEntreno] = useState(true)
  const existe = (db.competitions || []).some((x) => x.id === c.id)
  const set = (p) => setC((x) => ({ ...x, ...p }))
  const setR = (i, p) => setC((x) => ({ ...x, results: x.results.map((r, j) => (j === i ? { ...r, ...p } : r)) }))
  const ultimaPrueba = c.results[c.results.length - 1]?.event || EVENTS[0]
  const yaHayEntreno = db.training.some((t) => t.date === c.date && t.done)

  const guardar = () => {
    const limpio = { ...c, name: c.name.trim() || 'Competición', results: c.results.filter((r) => r.event && (r.mark || r.position)) }
    update((d) => {
      d.competitions ||= []
      const i = d.competitions.findIndex((x) => x.id === limpio.id)
      if (i >= 0) d.competitions[i] = limpio
      else d.competitions.push(limpio)
      // Competir también es entrenar: cuenta para la carga y sale en el calendario de entrenos.
      if (comoEntreno && limpio.results.length && limpio.date <= today() && !d.training.some((t) => t.date === limpio.date && t.done)) {
        d.training.push({
          id: uid('tr'), date: limpio.date, done: true, type: (d.settings.trainingTypes || []).find((x) => /compet/i.test(x)) || 'Competición',
          minutes: 60, rpe: 8, cmjPre: '', cmjPost: '', pains: [], competitionId: limpio.id,
          notes: `${limpio.name}: ${limpio.results.map((r) => `${r.event} ${r.mark}`).join(', ')}`,
        })
      }
    })
    onClose()
  }

  return (
    <Modal
      wide
      title={existe ? c.name || 'Competición' : 'Nueva competición'}
      onClose={onClose}
      foot={
        <>
          {existe && (
            <button className="btn ghost danger" onClick={() => { if (!confirm('¿Eliminar la competición y sus marcas?')) return; update((d) => { d.competitions = d.competitions.filter((x) => x.id !== c.id) }); onClose() }}>
              <Icon name="trash" size={13} /> Eliminar
            </button>
          )}
          {c.results.length > 0 && c.date <= today() && !yaHayEntreno && (
            <label className="row" style={{ gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={comoEntreno} onChange={(e) => setComoEntreno(e.target.checked)} /> Apuntarla también como entreno
            </label>
          )}
          <div className="spacer" />
          <button className="btn primary" onClick={guardar}>Guardar</button>
        </>
      }
    >
      <div className="stack">
        <div className="grid-3">
          <div className="field"><label>Nombre</label><input className="input" autoFocus value={c.name} placeholder="Autonómico absoluto, control…" onChange={(e) => set({ name: e.target.value })} /></div>
          <div className="field"><label>Fecha</label><input className="input" type="date" value={c.date} onChange={(e) => set({ date: e.target.value })} /></div>
          <div className="field"><label>Hora</label><input className="input" type="time" value={c.time || ''} onChange={(e) => set({ time: e.target.value })} /></div>
        </div>
        <div className="grid-3">
          <div className="field" style={{ gridColumn: 'span 2' }}><label>Sitio</label><input className="input" value={c.place || ''} placeholder="Estadio, ciudad" onChange={(e) => set({ place: e.target.value })} /></div>
          <div className="field">
            <label>Pista</label>
            <div className="row" style={{ gap: 5 }}>
              <button className={`chip${!c.indoor ? ' on' : ''}`} onClick={() => set({ indoor: false })}>Aire libre</button>
              <button className={`chip${c.indoor ? ' on' : ''}`} onClick={() => set({ indoor: true })}>Cubierta</button>
            </div>
          </div>
        </div>

        <div className="field">
          <label>Pruebas y marcas</label>
          <datalist id="pruebas-atletismo">{EVENTS.map((e) => <option key={e} value={e} />)}</datalist>
          {c.results.map((r, i) => {
            const v = parseMark(r.event, r.mark)
            return (
              <div key={r.id || i} className="res-row">
                <input className="input" list="pruebas-atletismo" placeholder="Prueba" value={r.event} onChange={(e) => setR(i, { event: e.target.value })} />
                <input className="input" placeholder={isField(r.event) ? 'metros (6,45)' : 'tiempo (7.12 · 1:58.3)'} value={r.mark || ''} onChange={(e) => setR(i, { mark: e.target.value })}
                  style={{ borderColor: r.mark && v == null ? 'var(--accent)' : '' }} />
                <input className="input" placeholder={windMatters(r.event) ? 'viento +1.2' : '—'} disabled={!windMatters(r.event)} value={r.wind || ''} onChange={(e) => setR(i, { wind: e.target.value })} />
                <input className="input" placeholder="ronda (serie, final)" value={r.round || ''} onChange={(e) => setR(i, { round: e.target.value })} />
                <input className="input" placeholder="puesto" value={r.position || ''} onChange={(e) => setR(i, { position: e.target.value })} />
                <button className="btn ghost icon sm" onClick={() => set({ results: c.results.filter((_, j) => j !== i) })}><Icon name="x" size={11} /></button>
              </div>
            )
          })}
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ results: [...c.results, { id: uid('res'), event: ultimaPrueba, mark: '', wind: '', round: '', position: '' }] })}>
            <Icon name="plus" size={12} /> Prueba
          </button>
          <span className="dim" style={{ fontSize: 11.5 }}>Si aún no has competido, deja la marca vacía: la competición sale en el calendario y en los avisos.</span>
        </div>

        <div className="field">
          <label>Notas</label>
          <textarea className="textarea" value={c.notes || ''} placeholder="Sensaciones, calentamiento, qué funcionó…" onChange={(e) => set({ notes: e.target.value })} />
        </div>
      </div>
    </Modal>
  )
}
