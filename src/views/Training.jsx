import React, { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import { useStore, uid } from '../lib/store.jsx'
import {
  today, iso, addDays, startOfWeek, parseIso, DAYS, DAYS_LONG, MONTHS, dur, fmtDate, weekLabel, monthMatrix,
} from '../lib/date.js'
import {
  RPE_COLOR, loadOf, typeColor, ZONES, SIDES, PAIN_KINDS, PAIN_WHEN, PAIN_COLOR, newPain,
  kindLabel, whereLabel, allPains, activeInjuries, injuryDays, injuryAge, longDate, painSummary, trainingStats,
} from '../lib/training.js'
import { activitiesOn, activityLine, activityNote, wellnessOn, healthStats, hrs } from '../lib/health.js'
import { GymLog, TrackLog, GymTab, TrackTab } from '../components/Gym.jsx'
import { isGymType, isTrackType, gymVolume, repsSummary, gymPRs, trackPRs, fmtTime, paceOf } from '../lib/gym.js'

const blank = (date, types) => ({
  id: uid('tr'), date: date || today(), done: true, type: types?.[0] || 'Rodaje',
  minutes: 60, rpe: 5, cmjPre: '', cmjPost: '', notes: '', pains: [],
})

const TABS = [
  ['semana', 'Semana'],
  ['calendario', 'Calendario'],
  ['gimnasio', 'Gimnasio'],
  ['series', 'Series'],
  ['estadisticas', 'Estadísticas'],
  ['molestias', 'Molestias y lesiones'],
]

const TAB_KEY = 'prolife.atletismo.tab'
const readTab = () => {
  try {
    const t = localStorage.getItem(TAB_KEY)
    return TABS.some(([k]) => k === t) ? t : 'semana'
  } catch {
    return 'semana'
  }
}

export default function Training() {
  const { db } = useStore()
  const [form, setForm] = useState(null)
  const [tab, setTabRaw] = useState(readTab)
  const setTab = (t) => {
    setTabRaw(t)
    try { localStorage.setItem(TAB_KEY, t) } catch { /* sin storage, se olvida y ya */ }
  }

  const byDate = useMemo(() => {
    const m = new Map()
    for (const t of db.training) m.set(t.date, t)
    return m
  }, [db.training])

  const open = (date) => setForm(byDate.get(date) || blank(date, db.settings.trainingTypes))
  const lesiones = activeInjuries(db)
  const weekStart = startOfWeek(new Date())
  const weekDone = db.training.filter((t) => t.done && t.date >= iso(weekStart)).length
  const goal = db.settings.weeklyTrainingGoal || 5

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Atletismo · {weekLabel(weekStart)}</div>
          <h2>Entrenamiento</h2>
          <p>{weekDone} de {goal} sesiones esta semana.</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn primary" onClick={() => open(today())}>
            <Icon name="plus" size={13} /> {byDate.get(today()) ? 'Editar el de hoy' : 'Registrar hoy'}
          </button>
        </div>
      </div>

      {lesiones.length > 0 && (
        <div className="notice err" style={{ marginBottom: 16 }}>
          <Icon name="heart" size={13} />
          <span>
            {lesiones.map((l, i) => (
              <span key={l.id}>
                {i > 0 && ' · '}
                <strong>{whereLabel(l)}</strong>{l.diagnosis ? ` (${l.diagnosis})` : ''}: lesionado {injuryAge(l)}
              </span>
            ))}
            {' '}
            <button className="linkish" onClick={() => setTab('molestias')}>Ver</button>
          </span>
        </div>
      )}

      <div className="tabs">
        {TABS.map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'semana' && <WeekTab byDate={byDate} onOpen={setForm} openDate={open} />}
      {tab === 'calendario' && <CalendarTab byDate={byDate} openDate={open} />}
      {tab === 'gimnasio' && <GymTab onOpenTraining={setForm} />}
      {tab === 'series' && <TrackTab onOpenTraining={setForm} />}
      {tab === 'estadisticas' && <TrainingStatsPanel />}
      {tab === 'molestias' && <PainTab onOpenTraining={(id) => setForm(db.training.find((t) => t.id === id))} />}

      {form && <TrainingForm entry={form} onClose={() => setForm(null)} />}
    </>
  )
}

/* ----------------------------------------------------------------- semana */

function WeekTab({ byDate, onOpen, openDate }) {
  const { db } = useStore()
  const weekStart = startOfWeek(new Date())
  const weekDays = Array.from({ length: 7 }, (_, i) => iso(addDays(weekStart, i)))

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
  }, [db.training])

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

  const maxLoad = Math.max(...history.map((h) => h.load), 1)

  return (
    <>
      <div className="grid-3" style={{ marginBottom: 12 }}>
        <div className="stat">
          <div className="eyebrow">Adherencia</div>
          <div className="value num">{weekTrainings.length}<span>/ {goal}</span></div>
          <div className="meter" style={{ marginTop: 10 }}>
            <i style={{ width: `${Math.min(100, (weekTrainings.length / goal) * 100)}%`, background: 'var(--green)' }} />
          </div>
          <div className="delta dim">{dur(weekMin * 60, true)} esta semana</div>
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

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <h3>Esta semana</h3>
          <span className="dim" style={{ fontSize: 12 }}>Toca un día para registrar o editar</span>
        </div>
        <div className="train-grid">
          {weekDays.map((d, i) => {
            const t = byDate.get(d)
            const future = d > today()
            const pain = (t?.pains || []).length > 0
            return (
              <button
                key={d}
                className={`train-day${t?.done ? ' done' : ''}${future ? ' rest' : ''}`}
                onClick={() => openDate(d)}
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
                {pain && <span style={{ fontSize: 9, color: 'var(--accent)' }}>⚠ molestia</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="hoy-grid">
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
              Tu media de {prevLoads.length} semanas: {Math.round(chronic)}.
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

      <div className="card hoy-col-3">
        <div className="card-head"><h3>Últimos entrenos</h3></div>
        {db.training.length ? (
          <div className="list scroll-box" style={{ maxHeight: 300 }}>
            {[...db.training].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map((t) => (
              <TrainingRow key={t.id} t={t} onClick={() => onOpen(t)} />
            ))}
          </div>
        ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Nada registrado todavía.</p>}
      </div>
      </div>
    </>
  )
}

export function TrainingRow({ t, onClick }) {
  const { db } = useStore()
  return (
    <div className={`list-row${onClick ? ' click' : ''}`} onClick={onClick}>
      <span className="dot" style={{ background: t.done ? typeColor(db, t.type) : 'var(--line-strong)' }} />
      <span style={{ width: 74 }} className="dim">{fmtDate(t.date)}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {t.done ? t.type : 'Descanso'}
        {t.notes ? <span className="dim" style={{ fontSize: 11.5 }}> · {t.notes}</span> : null}
      </span>
      {(t.pains || []).length > 0 && (
        <span className="badge hot" title={(t.pains || []).map((p) => `${whereLabel(p)} ${p.level}/10`).join(', ')}>
          ⚠ {(t.pains || []).length}
        </span>
      )}
      {t.done && <span className="badge" style={{ color: RPE_COLOR(t.rpe) }}>RPE {t.rpe}</span>}
      {t.done && <span className="mono dim">{t.minutes}′</span>}
    </div>
  )
}

/* -------------------------------------------------------------- calendario */

/**
 * El mes entero, con lo que hiciste cada día. Es lo que permite contestar
 * «¿qué hice el martes de hace tres semanas?» sin tener que acordarse.
 */
function CalendarTab({ byDate, openDate }) {
  const { db } = useStore()
  const [anchor, setAnchor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [sel, setSel] = useState(today())
  const cells = useMemo(() => monthMatrix(anchor.getFullYear(), anchor.getMonth()), [anchor])
  const key = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`

  const month = db.training.filter((t) => t.date.startsWith(key))
  const done = month.filter((t) => t.done)
  const types = new Map()
  for (const t of done) types.set(t.type, (types.get(t.type) || 0) + 1)
  const pains = month.reduce((a, t) => a + (t.pains || []).length, 0)
  const selT = byDate.get(sel)

  const shift = (n) => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + n, 1))

  return (
    <div className="split with-aside">
      <div className="stack">
        <div className="row" style={{ gap: 6 }}>
          <button className="btn ghost icon" onClick={() => shift(-1)} title="Mes anterior"><Icon name="chevronL" size={15} /></button>
          <h3 style={{ margin: 0, textTransform: 'capitalize', minWidth: 160, textAlign: 'center' }}>
            {MONTHS[anchor.getMonth()]} {anchor.getFullYear()}
          </h3>
          <button className="btn ghost icon" onClick={() => shift(1)} title="Mes siguiente"><Icon name="chevronR" size={15} /></button>
          <button className="btn sm" onClick={() => { const d = new Date(); setAnchor(new Date(d.getFullYear(), d.getMonth(), 1)); setSel(today()) }}>Hoy</button>
        </div>

        <div className="cal">
          <div className="cal-head">{DAYS.map((d) => <div key={d}>{d}</div>)}</div>
          <div className="cal-grid">
            {cells.map((c) => {
              const t = byDate.get(c.date)
              return (
                <div
                  key={c.date}
                  className={`cal-cell${c.out ? ' out' : ''}${c.date === today() ? ' today' : ''}${c.date === sel ? ' sel' : ''}`}
                  onClick={() => setSel(c.date)}
                  onDoubleClick={() => openDate(c.date)}
                >
                  <div className="cal-day">{c.day}</div>
                  {t?.done && (
                    <div className="cal-ev" style={{ '--c': typeColor(db, t.type), borderLeftColor: typeColor(db, t.type), background: `color-mix(in srgb, ${typeColor(db, t.type)} 14%, transparent)` }}>
                      {t.type}
                    </div>
                  )}
                  {t?.done && (
                    <div className="dim mono cal-extra" style={{ fontSize: 10 }}>
                      {t.minutes}′ · <span style={{ color: RPE_COLOR(t.rpe) }}>RPE {t.rpe}</span>
                    </div>
                  )}
                  {t && !t.done && <div className="dim cal-extra" style={{ fontSize: 10 }}>descanso</div>}
                  {!t?.done && activitiesOn(db, c.date).length > 0 && (
                    <div className="dim cal-extra" style={{ fontSize: 10 }} title="Grabado en el reloj, sin apuntar como entreno">
                      ⌚ {activitiesOn(db, c.date).map((a) => a.name || a.type).join(', ')}
                    </div>
                  )}
                  {(t?.pains || []).length > 0 && (
                    <div className="cal-extra" style={{ fontSize: 10, color: 'var(--accent)' }}>⚠ {(t.pains || []).map((p) => p.zone).join(', ')}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <p className="dim" style={{ fontSize: 11.5, margin: 0 }}>Toca un día para verlo al lado; doble toque para editarlo.</p>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-head">
            <h3>{longDate(sel)}</h3>
          </div>
          {selT ? <TrainingDetail t={selT} /> : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Nada apuntado este día.</p>}
          <button className="btn sm" style={{ marginTop: 12 }} onClick={() => openDate(sel)}>
            <Icon name={selT ? 'edit' : 'plus'} size={12} /> {selT ? 'Editar' : 'Apuntar'}
          </button>
        </div>

        <div className="card">
          <div className="card-head"><h3 style={{ textTransform: 'capitalize' }}>{MONTHS[anchor.getMonth()]}</h3></div>
          <div className="row wrap" style={{ gap: 20, marginBottom: 12 }}>
            <div><div className="num" style={{ fontSize: 24 }}>{done.length}</div><div className="eyebrow">sesiones</div></div>
            <div><div className="num" style={{ fontSize: 24 }}>{dur(done.reduce((a, t) => a + (Number(t.minutes) || 0), 0) * 60)}</div><div className="eyebrow">en total</div></div>
            <div><div className="num" style={{ fontSize: 24 }}>{done.reduce((a, t) => a + loadOf(t), 0)}</div><div className="eyebrow">carga</div></div>
            <div><div className="num" style={{ fontSize: 24, color: pains ? 'var(--accent)' : '' }}>{pains}</div><div className="eyebrow">molestias</div></div>
          </div>
          {[...types.entries()].sort((a, b) => b[1] - a[1]).map(([type, n]) => (
            <div key={type} className="row" style={{ gap: 8, fontSize: 12.5, marginBottom: 6 }}>
              <span className="dot" style={{ background: typeColor(db, type) }} />
              <span style={{ flex: 1 }}>{type}</span>
              <span className="mono">{n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Todo lo apuntado de un entreno, para leerlo sin abrir el formulario. */
export function TrainingDetail({ t }) {
  const { db } = useStore()
  return (
    <div className="stack" style={{ gap: 8 }}>
      {t.done ? (
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="chip on"><span className="dot" style={{ background: typeColor(db, t.type) }} />{t.type}</span>
          <span className="badge">{t.minutes} min</span>
          <span className="badge" style={{ color: RPE_COLOR(t.rpe) }}>RPE {t.rpe}</span>
          <span className="badge">carga {loadOf(t)}</span>
          {t.cmjPre && <span className="badge">CMJ {t.cmjPre}{t.cmjPost ? ` → ${t.cmjPost}` : ''}</span>}
        </div>
      ) : (
        <span className="dim">Descanso / no fui</span>
      )}
      {t.gym && (
        <div style={{ fontSize: 12.5 }}>
          {(t.gym.exercises || []).filter((e) => !e.skipped).map((e) => (
            <div key={e.key + e.name}><b>{e.name}</b> <span className="mono dim">{(e.sets || []).filter((s) => !s.warmup && s.reps).map((s) => `${s.kg || 0}×${s.reps}`).join(' · ')}</span></div>
          ))}
          <div className="dim" style={{ fontSize: 11.5 }}>Volumen {Math.round(gymVolume(t.gym)).toLocaleString('es')} kg{(t.gym.exercises || []).some((e) => e.skipped) ? ` · saltados: ${t.gym.exercises.filter((e) => e.skipped).map((e) => e.name).join(', ')}` : ''}</div>
        </div>
      )}
      {(t.reps || []).length > 0 && <div className="mono" style={{ fontSize: 12 }}>{repsSummary(t.reps)}</div>}
      {t.notes && <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>{t.notes}</p>}
      {(t.pains || []).map((p, i) => (
        <div key={i} className="notice" style={{ borderColor: PAIN_COLOR(p.level) }}>
          <span style={{ fontSize: 12.5 }}>
            <strong>{kindLabel(p.kind)}</strong> en {whereLabel(p).toLowerCase()} · {p.level}/10
            {p.when ? ` · ${PAIN_WHEN.find((w) => w.id === p.when)?.label.toLowerCase()}` : ''}
            {p.stopped ? ' · tuve que parar' : ''}
            {p.notes ? ` — ${p.notes}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ estadísticas */

/** Las estadísticas de atletismo. Se usan aquí y en la pantalla de Estadísticas. */
export function TrainingStatsPanel() {
  const { db } = useStore()
  const st = useMemo(() => trainingStats(db), [db])
  const goal = db.settings.weeklyTrainingGoal || 5

  if (!st.total) {
    return (
      <div className="empty">
        <div className="display">Sin entrenos todavía</div>
        <p>Apunta unos cuantos y aquí verás qué haces más, qué días vas y cómo evoluciona la carga.</p>
      </div>
    )
  }

  const maxWd = Math.max(...st.byWeekday, 1)
  const maxMonth = Math.max(...st.months.map((m) => m.n), 1)
  const maxType = st.byType[0]?.n || 1

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid-4">
        <div className="stat">
          <div className="eyebrow">Entrenos en total</div>
          <div className="value num">{st.total}</div>
          <div className="delta dim">{st.thisYear} este año · {st.thisMonth} este mes</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Horas entrenadas</div>
          <div className="value num">{(st.minutes / 60).toFixed(0)}<span>h</span></div>
          <div className="delta dim">{Math.round(st.avgMin)} min de media · RPE {st.avgRpe.toFixed(1)}</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Semanas cumpliendo</div>
          <div className="value num">{st.currentStreak}<span>seguidas</span></div>
          <div className="delta dim">
            mejor racha: {st.bestStreak} · {st.adherence === null ? 'sin histórico' : `${Math.round(st.adherence * 100)}% de las últimas 12`}
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">Día que más vas</div>
          <div className="value num" style={{ fontSize: 30 }}>{st.favDay === null ? '—' : DAYS_LONG[st.favDay]}</div>
          <div className="delta dim">
            {st.favDay === null ? '' : `${st.byWeekday[st.favDay]} entrenos`}
            {st.daysSinceLast !== null ? ` · último ${st.daysSinceLast === 0 ? 'hoy' : `hace ${st.daysSinceLast} d`}` : ''}
          </div>
        </div>
      </div>

      <MarcasPersonales />

      <div className="split even">
        <div className="card">
          <div className="card-head"><h3>Qué entrenas</h3><span className="dim" style={{ fontSize: 11.5 }}>por número de sesiones</span></div>
          <div className="table-wrap">
            <table className="tabla">
              <thead>
                <tr><th>Tipo</th><th /><th className="r">Sesiones</th><th className="r">Horas</th><th className="r">Media</th><th className="r">RPE</th><th className="r">Último</th></tr>
              </thead>
              <tbody>
                {st.byType.map((x) => (
                  <tr key={x.type}>
                    <td><span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: typeColor(db, x.type) }} />{x.type}</span></td>
                    <td style={{ width: '30%' }}>
                      <div className="meter"><i style={{ width: `${(x.n / maxType) * 100}%`, background: typeColor(db, x.type) }} /></div>
                    </td>
                    <td className="r mono">{x.n} <span className="dim">({Math.round((x.n / st.total) * 100)}%)</span></td>
                    <td className="r mono">{(x.minutes / 60).toFixed(1)}</td>
                    <td className="r mono">{Math.round(x.avgMin)}′</td>
                    <td className="r mono" style={{ color: RPE_COLOR(x.avgRpe) }}>{x.avgRpe.toFixed(1)}</td>
                    <td className="r dim">{fmtDate(x.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Qué días vas</h3><span className="dim" style={{ fontSize: 11.5 }}>sesiones por día de la semana</span></div>
          <div className="bars" style={{ height: 130 }}>
            {st.byWeekday.map((n, i) => (
              <div className="col" key={i} title={`${DAYS_LONG[i]}: ${n} entrenos · ${dur(st.minByWeekday[i] * 60)}`}>
                {st.byType.map((x) => {
                  const h = (x.byWeekday[i] / maxWd) * 100
                  if (!h) return null
                  return <div key={x.type} className="seg-bar" style={{ height: `${h}%`, background: typeColor(db, x.type) }} />
                })}
              </div>
            ))}
          </div>
          <div className="axis">{DAYS.map((d, i) => <span key={d}>{d} · {st.byWeekday[i]}</span>)}</div>
          <p className="dim" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
            Cada color es un tipo de entreno: se ve qué sueles hacer cada día.
          </p>
        </div>
      </div>

      <div className="split even">
        <div className="card">
          <div className="card-head"><h3>Mes a mes</h3><span className="dim mono" style={{ fontSize: 11 }}>últimos 12</span></div>
          <div className="bars" style={{ height: 130 }}>
            {st.months.map((m, i) => (
              <div className="col" key={m.key} title={`${MONTHS[m.month]} ${m.year}: ${m.n} sesiones · ${dur(m.minutes * 60)} · carga ${m.load}`}>
                <div className="seg-bar" style={{ height: `${(m.n / maxMonth) * 100}%`, background: i === st.months.length - 1 ? 'var(--green)' : 'var(--line-strong)' }} />
              </div>
            ))}
          </div>
          <div className="axis">{st.months.map((m) => <span key={m.key}>{MONTHS[m.month].slice(0, 1)}</span>)}</div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Récords y datos sueltos</h3></div>
          <div className="stack" style={{ gap: 9 }}>
            <Dato l="Mejor semana" v={st.bestWeek.n ? `${st.bestWeek.n} sesiones · ${weekLabel(st.bestWeek.start)}` : '—'} />
            <Dato l="Sesión más larga" v={st.longest ? `${st.longest.minutes} min · ${st.longest.type} · ${fmtDate(st.longest.date, { absolute: true })}` : '—'} />
            <Dato l="Sesión más dura (carga)" v={st.hardest ? `${loadOf(st.hardest)} · ${st.hardest.type} · ${fmtDate(st.hardest.date, { absolute: true })}` : '—'} />
            <Dato l="Días seguidos entrenando" v={st.streakDays} />
            <Dato l="Descansos apuntados" v={st.rest} />
            <Dato l="Objetivo semanal" v={`${goal} sesiones`} />
            {st.cmj.length > 0 && (
              <Dato l="Mejor CMJ previo" v={`${Math.max(...st.cmj.map((c) => c.pre))} cm (media ${(st.cmj.reduce((a, c) => a + c.pre, 0) / st.cmj.length).toFixed(1)})`} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const Dato = ({ l, v }) => (
  <div className="row" style={{ fontSize: 12.5, gap: 10 }}>
    <span className="muted">{l}</span>
    <div className="spacer" />
    <span style={{ textAlign: 'right' }}>{v}</span>
  </div>
)

/* -------------------------------------------------- molestias y lesiones */

function PainTab({ onOpenTraining }) {
  const { db, update } = useStore()
  const [days, setDays] = useState(90)
  const [lesion, setLesion] = useState(null)
  const sum = useMemo(() => painSummary(db, days), [db, days])
  const todas = useMemo(() => allPains(db), [db])
  const activas = activeInjuries(db)
  const pasadas = (db.injuries || []).filter((i) => i.to).sort((a, b) => b.from.localeCompare(a.from))
  const empeorando = sum.zones.filter((z) => z.n >= 3 && z.trend > 0.5)

  const alta = (l) =>
    update((d) => {
      const x = (d.injuries || []).find((i) => i.id === l.id)
      if (x) x.to = today()
    })

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="card">
        <div className="card-head">
          <h3>Lesiones abiertas</h3>
          <button className="btn sm" onClick={() => setLesion(newInjury())}><Icon name="plus" size={12} /> Lesión</button>
        </div>
        {activas.length ? (
          <div className="stack" style={{ gap: 10 }}>
            {activas.map((l) => (
              <div key={l.id} className="card flat" style={{ padding: '12px 14px', borderLeft: `3px solid ${PAIN_COLOR(l.level || 7)}` }}>
                <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: 14 }}>{whereLabel(l)}</strong>
                    {l.diagnosis && <span className="dim"> · {l.diagnosis}</span>}
                    <div className="dim" style={{ fontSize: 12, marginTop: 3 }}>
                      Desde el {fmtDate(l.from, { absolute: true })} · <strong>{injuryDays(l)} días</strong>
                      {l.level ? ` · ${l.level}/10 al empezar` : ''}
                    </div>
                    {l.notes && <div style={{ fontSize: 12.5, marginTop: 5, whiteSpace: 'pre-wrap' }}>{l.notes}</div>}
                    <InjuryTrail pains={todas} injury={l} />
                  </div>
                  <button className="btn sm primary" onClick={() => alta(l)} title="Ya estoy bien: cierra la lesión con fecha de hoy">
                    <Icon name="check" size={12} /> Alta
                  </button>
                  <button className="btn ghost icon sm" onClick={() => setLesion(l)}><Icon name="edit" size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
            Ninguna. Cuando marques una molestia como «lesión» al apuntar un entreno, se abre aquí
            sola y la puedes seguir hasta que te den el alta.
          </p>
        )}
      </div>

      <div className="grid-3">
        <div className="stat">
          <div className="eyebrow">Molestias apuntadas</div>
          <div className="value num">{sum.pains.length}</div>
          <div className="delta dim">en los últimos {days} días</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Entrenos con molestias</div>
          <div className="value num">{sum.sessions ? Math.round((sum.withPain / sum.sessions) * 100) : 0}<span>%</span></div>
          <div className="delta dim">{sum.withPain} de {sum.sessions} sesiones</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Lo que más se repite</div>
          <div className="value num" style={{ fontSize: 24 }}>{sum.zones[0]?.where || '—'}</div>
          <div className="delta dim">{sum.zones[0] ? `${sum.zones[0].n} veces · media ${sum.zones[0].avg.toFixed(1)}/10` : 'nada'}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Por zona</h3>
          <div className="seg">
            {[30, 90, 365].map((n) => <button key={n} className={days === n ? 'on' : ''} onClick={() => setDays(n)}>{n === 365 ? '1 año' : `${n} días`}</button>)}
          </div>
        </div>
        {sum.zones.length ? (
          <div className="table-wrap">
            <table className="tabla">
              <thead><tr><th>Zona</th><th className="r">Veces</th><th className="r">Media</th><th className="r">Máx.</th><th className="r">Va</th><th className="r">Última</th></tr></thead>
              <tbody>
                {sum.zones.map((z) => (
                  <tr key={z.where}>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        <span className="dot" style={{ background: PAIN_COLOR(z.avg) }} />{z.where}
                        {z.lesion > 0 && <span className="badge hot">lesión</span>}
                      </span>
                    </td>
                    <td className="r mono">{z.n}</td>
                    <td className="r mono">{z.avg.toFixed(1)}</td>
                    <td className="r mono">{z.max}</td>
                    <td className={`r mono ${z.trend > 0.5 ? 'down' : z.trend < -0.5 ? 'up' : 'dim'}`}>
                      {z.trend === null ? '—' : z.trend > 0.5 ? '▲ a peor' : z.trend < -0.5 ? '▼ a mejor' : 'igual'}
                    </td>
                    <td className="r dim">{fmtDate(z.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
            Sin molestias en este periodo. Se apuntan desde el propio entreno: «Añadir molestia».
          </p>
        )}
        {empeorando.length > 0 && (
          <div className="notice err" style={{ marginTop: 12 }}>
            <Icon name="x" size={13} />
            <span style={{ fontSize: 12.5 }}>
              {empeorando.map((z) => z.where).join(', ')}: se repite y va a peor. Es justo el patrón
              que acaba en lesión; quizá toque bajar carga o que lo vea alguien.
            </span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3>Historial de molestias</h3><span className="badge">{todas.length}</span></div>
        {todas.length ? (
          <div className="list">
            {todas.slice(0, 40).map((p, i) => (
              <div key={i} className="list-row click" onClick={() => onOpenTraining(p.trainingId)}>
                <span className="dot" style={{ background: PAIN_COLOR(p.level) }} />
                <span className="dim" style={{ width: 74 }}>{fmtDate(p.date)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {whereLabel(p)} <span className="dim" style={{ fontSize: 11.5 }}>· {kindLabel(p.kind).toLowerCase()} · {p.type}{p.notes ? ` · ${p.notes}` : ''}</span>
                </span>
                {p.stopped && <span className="badge hot">paré</span>}
                <span className="mono">{p.level}/10</span>
              </div>
            ))}
          </div>
        ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Nada todavía.</p>}
      </div>

      {pasadas.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Lesiones pasadas</h3></div>
          <div className="list">
            {pasadas.map((l) => (
              <div key={l.id} className="list-row click" onClick={() => setLesion(l)}>
                <span className="dot" style={{ background: 'var(--line-strong)' }} />
                <span style={{ flex: 1 }}>{whereLabel(l)}{l.diagnosis ? <span className="dim"> · {l.diagnosis}</span> : null}</span>
                <span className="dim" style={{ fontSize: 12 }}>{fmtDate(l.from, { absolute: true })} → {fmtDate(l.to, { absolute: true })}</span>
                <span className="badge">{injuryDays(l)} días</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {lesion && <InjuryForm injury={lesion} onClose={() => setLesion(null)} />}
    </div>
  )
}

/** Cómo ha ido doliendo esa zona desde que empezó la lesión. */
function InjuryTrail({ pains, injury }) {
  const pts = pains
    .filter((p) => p.zone === injury.zone && (p.side || '') === (injury.side || '') && p.date >= injury.from)
    .reverse()
  if (pts.length < 2) return null
  return (
    <div style={{ marginTop: 8 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>dolor desde entonces</div>
      <Sparkline rows={pts.map((p) => Number(p.level) || 0)} color="var(--accent)" fixed={[0, 10]} height={44} />
    </div>
  )
}

const newInjury = (patch = {}) => ({
  id: uid('les'), zone: '', side: '', from: today(), to: '', level: 6, diagnosis: '', notes: '', ...patch,
})

function InjuryForm({ injury, onClose }) {
  const { db, update } = useStore()
  const [l, setL] = useState(injury)
  const set = (p) => setL((x) => ({ ...x, ...p }))
  const exists = (db.injuries || []).some((x) => x.id === l.id)

  const save = () => {
    if (!l.zone) return
    update((d) => {
      d.injuries ||= []
      const i = d.injuries.findIndex((x) => x.id === l.id)
      if (i >= 0) d.injuries[i] = l
      else d.injuries.push(l)
    })
    onClose()
  }

  return (
    <Modal
      title={exists ? 'Lesión' : 'Nueva lesión'}
      onClose={onClose}
      foot={
        <>
          {exists && (
            <button className="btn ghost danger" onClick={() => { update((d) => { d.injuries = (d.injuries || []).filter((x) => x.id !== l.id) }); onClose() }}>
              <Icon name="trash" size={13} /> Eliminar
            </button>
          )}
          <div className="spacer" />
          <button className="btn primary" disabled={!l.zone} onClick={save}>Guardar</button>
        </>
      }
    >
      <div className="stack">
        <ZonePicker value={l} onChange={set} />
        <div className="grid-3">
          <div className="field"><label>Desde</label><input className="input" type="date" value={l.from} onChange={(e) => set({ from: e.target.value })} /></div>
          <div className="field"><label>Alta</label><input className="input" type="date" value={l.to || ''} onChange={(e) => set({ to: e.target.value })} /></div>
          <div className="field"><label>Dolor al empezar (1–10)</label><input className="input" type="number" min="1" max="10" value={l.level || ''} onChange={(e) => set({ level: Number(e.target.value) })} /></div>
        </div>
        <div className="field">
          <label>Diagnóstico</label>
          <input className="input" value={l.diagnosis || ''} placeholder="Rotura fibrilar grado 1, tendinopatía, sobrecarga…" onChange={(e) => set({ diagnosis: e.target.value })} />
        </div>
        <div className="field">
          <label>Notas</label>
          <textarea className="textarea" value={l.notes || ''} placeholder="Cómo pasó, fisio, qué puedo hacer y qué no, plan de vuelta…" onChange={(e) => set({ notes: e.target.value })} />
        </div>
      </div>
    </Modal>
  )
}

function ZonePicker({ value, onChange }) {
  return (
    <>
      <div className="field">
        <label>Dónde</label>
        <div className="row wrap" style={{ gap: 5 }}>
          {ZONES.map((z) => (
            <button key={z} className={`chip${value.zone === z ? ' on' : ''}`} onClick={() => onChange({ zone: z })}>{z}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Lado</label>
        <div className="row wrap" style={{ gap: 5 }}>
          {SIDES.map((s) => (
            <button key={s.id} className={`chip${(value.side || '') === s.id ? ' on' : ''}`} onClick={() => onChange({ side: s.id })}>{s.label}</button>
          ))}
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------- formulario */

function Sparkline({ rows, color = 'var(--green)', fixed, height = 78 }) {
  const min = fixed ? fixed[0] : Math.min(...rows)
  const max = fixed ? fixed[1] : Math.max(...rows)
  const range = max - min || 1
  const x = (i) => (rows.length === 1 ? 50 : (i / (rows.length - 1)) * 100)
  const pts = rows.map((v, i) => `${x(i)},${100 - ((v - min) / range) * 100}`).join(' ')
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      {rows.map((v, i) => (
        <circle key={i} cx={x(i)} cy={100 - ((v - min) / range) * 100} r="1.4" fill={color} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

export function TrainingForm({ entry, onClose }) {
  const { db, update, applyChange } = useStore()
  const [t, setT] = useState(() => ({ pains: [], ...entry }))
  const [painEdit, setPainEdit] = useState(null)
  const exists = db.training.some((x) => x.id === t.id)
  const set = (p) => setT((x) => ({ ...x, ...p }))
  const types = db.settings.trainingTypes || []

  /**
   * Una molestia marcada como lesión abre una lesión para poder seguirla —si
   * no hay ya una abierta en esa misma zona—. Es lo que hace que «me he
   * lesionado» no se quede en una nota perdida de un martes.
   */
  const lesionesNuevas = (t.pains || []).filter(
    (p) => p.kind === 'lesion' && p.zone &&
      !activeInjuries(db).some((l) => l.zone === p.zone && (l.side || '') === (p.side || ''))
  )

  /**
   * Va por `applyChange` para poder apuntar el entreno en la pista, con el
   * ordenador apagado en casa. El tramo de tiempo que alimenta las estadísticas
   * lo crea la propia operación (`server/ops.js`), atado al id del entreno, así
   * que sale igual se apunte donde se apunte.
   */
  const save = () => {
    applyChange({ kind: 'entreno', training: t })
    if (lesionesNuevas.length) {
      update((d) => {
        d.injuries ||= []
        for (const p of lesionesNuevas) {
          d.injuries.push(newInjury({ zone: p.zone, side: p.side || '', from: t.date, level: p.level, notes: p.notes || '' }))
        }
      })
    }
    onClose()
  }

  const savePain = (p) => {
    const pains = [...(t.pains || [])]
    if (painEdit.index >= 0) pains[painEdit.index] = p
    else pains.push(p)
    set({ pains })
    setPainEdit(null)
  }

  return (
    <Modal
      wide={!!t.gym || isGymType(t.type)}
      title={longDate(t.date)}
      subtitle={contexto(db, t.date)}
      onClose={onClose}
      foot={
        painEdit ? null : (
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
        )
      }
    >
      {painEdit ? (
        <PainEditor pain={painEdit.pain} onCancel={() => setPainEdit(null)} onSave={savePain} />
      ) : (
        <div className="stack">
          <div className="row wrap" style={{ gap: 6 }}>
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
                    <button key={x} className={`chip${t.type === x ? ' on' : ''}`} onClick={() => set({ type: x })}>
                      <span className="dot" style={{ background: typeColor(db, x) }} />{x}
                    </button>
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

              <span className="dim" style={{ fontSize: 12 }}>
                Carga de la sesión: {(Number(t.rpe) || 0) * (Number(t.minutes) || 0)}
                {t.cmjPre && t.cmjPost && (
                  <>
                    {' · '}variación del CMJ {(((Number(t.cmjPost) - Number(t.cmjPre)) / Number(t.cmjPre)) * 100).toFixed(1)}%
                    {Number(t.cmjPost) < Number(t.cmjPre) * 0.9 ? ' — fatiga alta' : ''}
                  </>
                )}
              </span>
            </>
          )}

          {t.done && (isGymType(t.type) || t.gym) && <GymLog t={t} set={set} />}
          {t.done && (isTrackType(t.type) || (t.reps || []).length > 0) && <TrackLog t={t} set={set} />}

          {/* Lo que grabó el reloj ese día: un toque y pasa la duración y los datos a las notas. */}
          {activitiesOn(db, t.date).map((a) => {
            const nota = activityNote(a)
            const usada = (t.notes || '').includes(nota)
            return (
              <div key={a.id} className="notice" style={{ alignItems: 'center' }}>
                <Icon name="activity" size={13} />
                <span style={{ fontSize: 12.5, flex: 1 }}>Garmin: {a.name ? `${a.name} · ` : ''}{activityLine(a)}</span>
                <button className="btn sm" disabled={usada} onClick={() => set({
                  done: true,
                  minutes: Math.round((a.seconds || 0) / 60) || t.minutes,
                  notes: [t.notes, nota].filter(Boolean).join(String.fromCharCode(10)),
                  garminId: a.id,
                })}>{usada ? 'Usado' : 'Usar'}</button>
              </div>
            )
          })}

          <div className="field">
            <label>Molestias {(t.pains || []).length > 0 && `(${t.pains.length})`}</label>
            {(t.pains || []).length > 0 && (
              <div className="stack" style={{ gap: 6, marginBottom: 6 }}>
                {t.pains.map((p, i) => (
                  <div key={i} className="list-row click" style={{ borderLeft: `3px solid ${PAIN_COLOR(p.level)}`, paddingLeft: 8 }}
                    onClick={() => setPainEdit({ index: i, pain: p })}>
                    <span style={{ flex: 1, fontSize: 13 }}>
                      <strong>{kindLabel(p.kind)}</strong> · {whereLabel(p)}
                      <span className="dim" style={{ fontSize: 11.5 }}>
                        {p.when ? ` · ${PAIN_WHEN.find((w) => w.id === p.when)?.label.toLowerCase()}` : ''}{p.stopped ? ' · paré' : ''}
                      </span>
                    </span>
                    <span className="mono">{p.level}/10</span>
                    <button className="btn ghost icon sm" title="Quitar" onClick={(e) => { e.stopPropagation(); set({ pains: t.pains.filter((_, j) => j !== i) }) }}>
                      <Icon name="x" size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPainEdit({ index: -1, pain: newPain() })}>
              <Icon name="plus" size={12} /> Añadir molestia
            </button>
            {lesionesNuevas.length > 0 && (
              <span className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>
                Al guardar se abrirá una lesión en {lesionesNuevas.map((p) => whereLabel(p).toLowerCase()).join(' y ')} para
                seguirla hasta el alta (Atletismo → Molestias y lesiones).
              </span>
            )}
          </div>

          <div className="field">
            <label>Notas</label>
            <textarea className="textarea" value={t.notes} placeholder="Series, tiempos, sensaciones…" onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Una molestia: dónde, cuánto, de qué tipo y cuándo. */
function PainEditor({ pain, onCancel, onSave }) {
  const [p, setP] = useState(pain)
  const set = (x) => setP((y) => ({ ...y, ...x }))
  return (
    <div className="stack">
      <ZonePicker value={p} onChange={set} />

      <div className="field">
        <label>Cuánto duele — {p.level}/10</label>
        <div className="rpe-scale">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
            <button key={v} className={p.level === v ? 'on' : ''} style={p.level === v ? { background: PAIN_COLOR(v) } : undefined} onClick={() => set({ level: v })}>
              {v}
            </button>
          ))}
        </div>
        <span className="dim" style={{ fontSize: 11 }}>1 apenas lo noto · 4 molesta · 7 cuesta seguir · 10 no puedo</span>
      </div>

      <div className="field">
        <label>Qué es</label>
        <div className="row wrap" style={{ gap: 6 }}>
          {PAIN_KINDS.map((k) => (
            <button key={k.id} className={`chip${p.kind === k.id ? ' on' : ''}`} onClick={() => set({ kind: k.id, stopped: k.id === 'lesion' ? true : p.stopped })} title={k.hint}>
              {k.label}
            </button>
          ))}
        </div>
        <span className="dim" style={{ fontSize: 11 }}>{PAIN_KINDS.find((k) => k.id === p.kind)?.hint}</span>
      </div>

      <div className="field">
        <label>Cuándo</label>
        <div className="row wrap" style={{ gap: 6 }}>
          {PAIN_WHEN.map((w) => (
            <button key={w.id} className={`chip${p.when === w.id ? ' on' : ''}`} onClick={() => set({ when: w.id })}>{w.label}</button>
          ))}
        </div>
      </div>

      <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!p.stopped} onChange={(e) => set({ stopped: e.target.checked })} />
        <span style={{ fontSize: 13 }}>Tuve que parar o cortar el entreno</span>
      </label>

      <div className="field">
        <label>Cómo es</label>
        <input className="input" value={p.notes || ''} placeholder="Pinchazo al apoyar, tirantez al estirar, hinchazón…" onChange={(e) => set({ notes: e.target.value })} />
      </div>

      <div className="row" style={{ gap: 6 }}>
        <button className="btn ghost" onClick={onCancel}>Volver</button>
        <div className="spacer" />
        <button className="btn primary" disabled={!p.zone} onClick={() => onSave(p)}>
          {p.zone ? 'Añadir al entreno' : 'Elige dónde'}
        </button>
      </div>
    </div>
  )
}

/** «Anoche: 6 h 40 · FC reposo 52 (+4) · Body Battery 64»: con qué llegabas a ese entreno. */
function contexto(db, date) {
  const w = wellnessOn(db, date)
  if (!w) return undefined
  const base = healthStats(db).restBase
  const partes = []
  if (w.sleep?.seconds) partes.push(`Anoche ${hrs(w.sleep.seconds)}`)
  if (w.restingHr) partes.push(`FC reposo ${w.restingHr}${base ? ` (${w.restingHr - Math.round(base) >= 0 ? '+' : ''}${w.restingHr - Math.round(base)})` : ''}`)
  if (w.bbHigh != null) partes.push(`Body Battery ${w.bbHigh}`)
  return partes.join(' · ') || undefined
}

/** Las marcas de gimnasio y de pista, juntas: lo primero que uno quiere ver. */
function MarcasPersonales() {
  const { db } = useStore()
  const gym = useMemo(() => gymPRs(db).sort((a, b) => b.best1rmDate.localeCompare(a.best1rmDate)).slice(0, 8), [db])
  const pista = useMemo(() => trackPRs(db), [db])
  if (!gym.length && !pista.length) return null
  return (
    <div className="split even">
      <div className="card">
        <div className="card-head"><h3>Marcas de gimnasio</h3><span className="dim" style={{ fontSize: 11.5 }}>las más recientes primero</span></div>
        {gym.length ? (
          <div className="table-wrap">
            <table className="tabla">
              <thead><tr><th>Ejercicio</th><th className="r">Máximo</th><th className="r">1RM est.</th><th className="r">Desde</th></tr></thead>
              <tbody>
                {gym.map((p) => (
                  <tr key={p.key}>
                    <td>{p.name}</td>
                    <td className="r mono">{p.maxKg} kg×{p.maxKgReps}</td>
                    <td className="r mono">{Math.round(p.best1rm)} kg</td>
                    <td className="r dim">{fmtDate(p.best1rmDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Apunta pesos en tus sesiones de gimnasio.</p>}
      </div>
      <div className="card">
        <div className="card-head"><h3>Marcas en pista</h3><span className="dim" style={{ fontSize: 11.5 }}>mejor tiempo por distancia en series</span></div>
        {pista.length ? (
          <div className="table-wrap">
            <table className="tabla">
              <thead><tr><th>Distancia</th><th className="r">Mejor</th><th className="r">Ritmo</th><th className="r">Media</th><th className="r">Cuándo</th></tr></thead>
              <tbody>
                {pista.map((p) => (
                  <tr key={p.dist}>
                    <td><b>{p.dist} m</b></td>
                    <td className="r mono">{fmtTime(p.best)}</td>
                    <td className="r mono dim">{paceOf(p.dist, p.best)}</td>
                    <td className="r mono">{fmtTime(p.avg)}</td>
                    <td className="r dim">{fmtDate(p.bestDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Apunta los tiempos de tus series.</p>}
      </div>
    </div>
  )
}
