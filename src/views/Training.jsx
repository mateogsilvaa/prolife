import React, { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import { useStore, uid, AREAS } from '../lib/store.jsx'
import { today, iso, addDays, startOfWeek, parseIso, weekday, DAYS, dur, fmtDate, weekLabel } from '../lib/date.js'

const RPE_COLOR = (v) =>
  v <= 3 ? 'var(--green)' : v <= 5 ? '#7d9a5e' : v <= 7 ? 'var(--amber)' : v <= 9 ? '#c4622a' : 'var(--accent)'

const blank = (date, types) => ({
  id: uid('tr'), date: date || today(), done: true, type: types?.[0] || 'Rodaje',
  minutes: 60, rpe: 5, cmjPre: '', cmjPost: '', notes: '',
})

/** Carga de sesión = RPE × minutos. Es la métrica estándar de carga interna. */
const loadOf = (t) => (t.done ? (Number(t.rpe) || 0) * (Number(t.minutes) || 0) : 0)

export default function Training() {
  const { db, update } = useStore()
  const [form, setForm] = useState(null)

  const weekStart = startOfWeek(new Date())
  const weekDays = Array.from({ length: 7 }, (_, i) => iso(addDays(weekStart, i)))
  const byDate = useMemo(() => {
    const m = new Map()
    for (const t of db.training) m.set(t.date, t)
    return m
  }, [db.training])

  const weekTrainings = weekDays.map((d) => byDate.get(d)).filter((t) => t?.done)
  const goal = db.settings.weeklyTrainingGoal || 5
  const weekLoad = weekTrainings.reduce((a, t) => a + loadOf(t), 0)
  const weekMin = weekTrainings.reduce((a, t) => a + (Number(t.minutes) || 0), 0)
  const avgRpe = weekTrainings.length
    ? (weekTrainings.reduce((a, t) => a + (Number(t.rpe) || 0), 0) / weekTrainings.length).toFixed(1)
    : '—'

  // carga de las últimas 8 semanas, para ver si subes o bajas demasiado rápido
  const history = useMemo(() => {
    const out = []
    for (let i = 7; i >= 0; i--) {
      const start = iso(addDays(weekStart, -7 * i))
      const end = iso(addDays(parseIso(start), 6))
      const list = db.training.filter((t) => t.done && t.date >= start && t.date <= end)
      out.push({
        start,
        load: list.reduce((a, t) => a + loadOf(t), 0),
        sessions: list.length,
        minutes: list.reduce((a, t) => a + (Number(t.minutes) || 0), 0),
      })
    }
    return out
  }, [db.training, weekStart])

  const prevLoads = history.slice(0, -1).filter((w) => w.load > 0)
  const chronic = prevLoads.length ? prevLoads.reduce((a, w) => a + w.load, 0) / prevLoads.length : 0
  const ratio = chronic ? weekLoad / chronic : null

  const cmjRows = db.training
    .filter((t) => t.done && t.cmjPre)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
  const lastCmj = cmjRows[cmjRows.length - 1]
  const cmjBase = cmjRows.length >= 4
    ? cmjRows.slice(-8, -1).reduce((a, t) => a + Number(t.cmjPre), 0) / Math.max(1, cmjRows.slice(-8, -1).length)
    : null

  const byType = useMemo(() => {
    const m = new Map()
    for (const t of db.training.filter((x) => x.done)) {
      m.set(t.type, (m.get(t.type) || 0) + (Number(t.minutes) || 0))
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [db.training])

  const maxLoad = Math.max(...history.map((h) => h.load), 1)

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Atletismo · {weekLabel(weekStart)}</div>
          <h2>Entrenamiento</h2>
          <p>
            {weekTrainings.length} de {goal} sesiones esta semana · {dur(weekMin * 60, true)} en total.
          </p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {/* `Deporte/` existe desde siempre en el disco; hasta ahora no había forma
              de llegar a ella desde aquí: planes, series y vídeos viven ahí. */}
          <a className="btn ghost" href="#/archivos/Deporte" title="Planes, series y vídeos en Deporte/">
            <Icon name="folder" size={13} /> Documentos
          </a>
          <button className="btn primary" onClick={() => setForm(byDate.get(today()) || blank(today(), db.settings.trainingTypes))}>
            <Icon name="plus" size={13} /> Registrar hoy
          </button>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="eyebrow">Adherencia</div>
          <div className="value num">{weekTrainings.length}<span>/ {goal}</span></div>
          <div className="meter" style={{ marginTop: 10 }}>
            <i style={{ width: `${Math.min(100, (weekTrainings.length / goal) * 100)}%`, background: 'var(--green)' }} />
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">Carga semanal <span className="dim">(RPE × min)</span></div>
          <div className="value num">{weekLoad}</div>
          <div className={`delta ${ratio > 1.3 ? 'down' : ratio && ratio < 0.8 ? 'dim' : 'up'}`}>
            {ratio === null ? <span className="dim">sin histórico</span>
              : ratio > 1.3 ? <>⚠ un {Math.round((ratio - 1) * 100)}% por encima de tu media: ojo al salto</>
              : ratio < 0.8 ? <>{Math.round((1 - ratio) * 100)}% por debajo de tu media</>
              : <>en línea con tu media ({Math.round(chronic)})</>}
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">RPE medio</div>
          <div className="value num">{avgRpe}</div>
          <div className="delta dim">
            {lastCmj?.cmjPre
              ? `último CMJ previo ${lastCmj.cmjPre} cm${cmjBase ? ` · media ${cmjBase.toFixed(1)}` : ''}`
              : 'sin datos de CMJ todavía'}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <h3>Esta semana</h3>
          <span className="dim" style={{ fontSize: 12 }}>Clic en un día para registrar o editar</span>
        </div>
        <div className="train-grid">
          {weekDays.map((d, i) => {
            const t = byDate.get(d)
            const future = d > today()
            return (
              <button
                key={d}
                className={`train-day${t?.done ? ' done' : ''}${future ? ' rest' : ''}`}
                onClick={() => setForm(t || blank(d, db.settings.trainingTypes))}
                title={t ? `${t.type} · RPE ${t.rpe} · ${t.minutes} min` : 'Sin registrar'}
              >
                <span className="eyebrow">{DAYS[i]}</span>
                <span className="n">{parseIso(d).getDate()}</span>
                {t?.done ? (
                  <>
                    <span style={{ fontSize: 9 }}>{t.type}</span>
                    <span className="dot" style={{ background: RPE_COLOR(t.rpe), width: 6, height: 6 }} />
                  </>
                ) : t ? (
                  <span style={{ fontSize: 9 }}>descanso</span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      <div className="split even" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-head"><h3>Carga por semana</h3><span className="dim mono" style={{ fontSize: 11 }}>últimas 8</span></div>
          <div className="bars" style={{ height: 130 }}>
            {history.map((h, i) => (
              <div className="col" key={h.start} title={`${weekLabel(h.start)} · carga ${h.load} · ${h.sessions} sesiones`}>
                <div
                  className="seg-bar"
                  style={{
                    height: `${(h.load / maxLoad) * 100}%`,
                    background: i === history.length - 1 ? 'var(--green)' : 'var(--line-strong)',
                  }}
                />
              </div>
            ))}
          </div>
          <div className="axis">{history.map((h, i) => <span key={h.start}>{i === history.length - 1 ? 'ahora' : `-${history.length - 1 - i}`}</span>)}</div>
          {chronic > 0 && (
            <p className="dim" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
              La línea de referencia es tu media de {prevLoads.length} semanas: {Math.round(chronic)}.
              Subidas bruscas de más del 30% son las que se asocian a lesiones.
            </p>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>CMJ previo al entreno</h3><span className="dim mono" style={{ fontSize: 11 }}>cm</span></div>
          {cmjRows.length >= 2 ? (
            <>
              <Sparkline rows={cmjRows.map((t) => Number(t.cmjPre))} />
              <div className="list" style={{ marginTop: 10 }}>
                {cmjRows.slice(-4).reverse().map((t) => {
                  const drop = t.cmjPost ? ((Number(t.cmjPost) - Number(t.cmjPre)) / Number(t.cmjPre)) * 100 : null
                  return (
                    <div className="list-row" key={t.id}>
                      <span className="dim" style={{ width: 74 }}>{fmtDate(t.date)}</span>
                      <span className="mono">{t.cmjPre}</span>
                      <span className="dim">→</span>
                      <span className="mono">{t.cmjPost || '—'}</span>
                      <div className="spacer" />
                      {drop !== null && (
                        <span className={`mono ${drop < -10 ? 'down' : 'dim'}`} style={{ fontSize: 11 }}>
                          {drop > 0 ? '+' : ''}{drop.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="dim" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
                Una caída del CMJ post respecto al pre por encima del 10% indica fatiga
                neuromuscular alta en ese entreno.
              </p>
            </>
          ) : (
            <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
              Apunta el CMJ antes y después en al menos dos entrenos y aquí verás la evolución.
            </p>
          )}
        </div>
      </div>

      <div className="split even">
        <div className="card">
          <div className="card-head"><h3>Reparto por tipo</h3></div>
          {byType.length ? (
            <div className="stack" style={{ gap: 9 }}>
              {byType.map(([type, min]) => (
                <div key={type} className="row" style={{ fontSize: 12.5, gap: 8 }}>
                  <span style={{ width: 96 }}>{type}</span>
                  <div className="meter" style={{ flex: 1 }}>
                    <i style={{ width: `${(min / byType[0][1]) * 100}%`, background: 'var(--green)' }} />
                  </div>
                  <span className="mono dim" style={{ width: 52, textAlign: 'right' }}>{dur(min * 60)}</span>
                </div>
              ))}
            </div>
          ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Sin entrenos registrados.</p>}
        </div>

        <div className="card">
          <div className="card-head"><h3>Últimos entrenos</h3></div>
          {db.training.length ? (
            <div className="list">
              {[...db.training].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((t) => (
                <div key={t.id} className="list-row click" onClick={() => setForm(t)}>
                  <span className="dot" style={{ background: t.done ? RPE_COLOR(t.rpe) : 'var(--line-strong)' }} />
                  <span style={{ width: 74 }} className="dim">{fmtDate(t.date)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{t.done ? t.type : 'Descanso'}</span>
                  {t.done && <span className="badge">RPE {t.rpe}</span>}
                  {t.done && <span className="mono dim">{t.minutes}′</span>}
                </div>
              ))}
            </div>
          ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Nada registrado todavía.</p>}
        </div>
      </div>

      {form && <TrainingForm entry={form} onClose={() => setForm(null)} />}
    </>
  )
}

function Sparkline({ rows }) {
  const min = Math.min(...rows)
  const max = Math.max(...rows)
  const range = max - min || 1
  const pts = rows.map((v, i) => `${(i / (rows.length - 1)) * 100},${100 - ((v - min) / range) * 100}`).join(' ')
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: 78 }}>
      <polyline points={pts} fill="none" stroke="var(--green)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      {rows.map((v, i) => (
        <circle key={i} cx={(i / (rows.length - 1)) * 100} cy={100 - ((v - min) / range) * 100} r="1.4" fill="var(--green)" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

function TrainingForm({ entry, onClose }) {
  const { db, update } = useStore()
  const [t, setT] = useState(entry)
  const exists = db.training.some((x) => x.id === t.id)
  const set = (p) => setT((x) => ({ ...x, ...p }))
  const types = db.settings.trainingTypes || []

  const save = () => {
    update((d) => {
      const i = d.training.findIndex((x) => x.id === t.id)
      if (i >= 0) d.training[i] = t
      else d.training.push(t)

      // el tiempo de entreno también alimenta las estadísticas generales
      const sid = 'sess_' + t.id
      const si = d.sessions.findIndex((s) => s.id === sid)
      if (t.done && Number(t.minutes) > 0) {
        const row = {
          id: sid, area: 'sport', refId: null, taskId: null, label: t.type,
          date: t.date, start: Date.now(), end: Date.now(),
          seconds: Number(t.minutes) * 60, source: 'manual',
        }
        if (si >= 0) d.sessions[si] = row
        else d.sessions.push(row)
      } else if (si >= 0) {
        d.sessions.splice(si, 1)
      }
    })
    onClose()
  }

  return (
    <Modal
      title={parseIso(t.date).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
      onClose={onClose}
      foot={
        <>
          {exists && (
            <button
              className="btn ghost danger"
              onClick={() => {
                update((d) => {
                  d.training = d.training.filter((x) => x.id !== t.id)
                  d.sessions = d.sessions.filter((s) => s.id !== 'sess_' + t.id)
                })
                onClose()
              }}
            >
              <Icon name="trash" size={13} /> Eliminar
            </button>
          )}
          <div className="spacer" />
          <button className="btn primary" onClick={save}>Guardar</button>
        </>
      }
    >
      <div className="stack">
        <div className="row" style={{ gap: 6 }}>
          <button className={`chip${t.done ? ' on' : ''}`} onClick={() => set({ done: true })}>
            <Icon name="check" size={11} /> Entrené
          </button>
          <button className={`chip${!t.done ? ' on' : ''}`} onClick={() => set({ done: false })}>
            Descanso / no fui
          </button>
        </div>

        {t.done && (
          <>
            <div className="field">
              <label>Tipo de entreno</label>
              <div className="row wrap" style={{ gap: 6 }}>
                {types.map((x) => (
                  <button key={x} className={`chip${t.type === x ? ' on' : ''}`} onClick={() => set({ type: x })}>{x}</button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Intensidad percibida (RPE) — {t.rpe}/10</label>
              <div className="rpe-scale">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                  <button
                    key={v}
                    className={t.rpe === v ? 'on' : ''}
                    style={t.rpe === v ? { background: RPE_COLOR(v) } : undefined}
                    onClick={() => set({ rpe: v })}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <span className="dim" style={{ fontSize: 11 }}>
                1 muy suave · 5 moderado · 7 duro · 9 casi máximo · 10 máximo
              </span>
            </div>

            <div className="grid-3">
              <div className="field"><label>Duración (min)</label><input className="input" type="number" min="0" step="5" value={t.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })} /></div>
              <div className="field"><label>CMJ pre (cm)</label><input className="input" type="number" step="0.1" value={t.cmjPre} placeholder="—" onChange={(e) => set({ cmjPre: e.target.value })} /></div>
              <div className="field"><label>CMJ post (cm)</label><input className="input" type="number" step="0.1" value={t.cmjPost} placeholder="—" onChange={(e) => set({ cmjPost: e.target.value })} /></div>
            </div>

            {t.cmjPre && t.cmjPost && (
              <div className="card flat" style={{ padding: 0 }}>
                <span className="dim" style={{ fontSize: 12 }}>
                  Variación del CMJ: {(((Number(t.cmjPost) - Number(t.cmjPre)) / Number(t.cmjPre)) * 100).toFixed(1)}%
                  {Number(t.cmjPost) < Number(t.cmjPre) * 0.9 ? ' — fatiga alta' : ''}
                </span>
              </div>
            )}

            <div className="field">
              <label>Carga de la sesión</label>
              <span className="num" style={{ fontSize: 22 }}>{(Number(t.rpe) || 0) * (Number(t.minutes) || 0)}</span>
              <span className="dim" style={{ fontSize: 11 }}>RPE × minutos</span>
            </div>
          </>
        )}

        <div className="field">
          <label>Notas</label>
          <textarea className="textarea" value={t.notes} placeholder="Series, sensaciones, molestias, tiempos…" onChange={(e) => set({ notes: e.target.value })} />
        </div>
      </div>
    </Modal>
  )
}
