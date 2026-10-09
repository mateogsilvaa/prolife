import React, { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { useStore, AREAS } from '../lib/store.jsx'
import { weekSummary, recentWeeks, weekProgress, delta, pct } from '../lib/stats.js'
import { dur, DAYS, DAYS_LONG, startOfWeek, addDays, weekLabel, iso, parseIso, MONTHS, fmtDate } from '../lib/date.js'
import { uniStats, timeStats, taskStats, volunteerSummary } from '../lib/insights.js'
import { TrainingStatsPanel } from './Training.jsx'

const TABS = [
  ['semana', 'La semana'],
  ['uni', 'Universidad'],
  ['atletismo', 'Atletismo'],
  ['tiempo', 'Tiempo y hábitos'],
  ['tareas', 'Tareas'],
  ['voluntariado', 'Voluntariado'],
]
const TAB_KEY = 'prolife.stats.tab'

export default function Stats() {
  const [tab, setTabRaw] = useState(() => {
    try {
      const t = localStorage.getItem(TAB_KEY)
      return TABS.some(([k]) => k === t) ? t : 'semana'
    } catch {
      return 'semana'
    }
  })
  const setTab = (t) => {
    setTabRaw(t)
    try { localStorage.setItem(TAB_KEY, t) } catch { /* da igual */ }
  }
  return (
    <>
      <div className="tabs" style={{ overflowX: 'auto' }}>
        {TABS.map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'semana' && <Semana />}
      {tab === 'uni' && <Universidad />}
      {tab === 'atletismo' && <TrainingStatsPanel />}
      {tab === 'tiempo' && <Tiempo />}
      {tab === 'tareas' && <Tareas />}
      {tab === 'voluntariado' && <Voluntariado />}
    </>
  )
}

function Semana() {
  const { db } = useStore()
  const [offset, setOffset] = useState(0) // 0 = semana actual
  const [range, setRange] = useState(12)

  const monday = addDays(startOfWeek(new Date()), -7 * offset)
  const cur = useMemo(() => weekSummary(db, monday), [db, offset])
  const prev = useMemo(() => weekSummary(db, addDays(monday, -7)), [db, offset])
  const history = useMemo(() => recentWeeks(db, range, monday), [db, range, offset])

  const before = history.slice(0, -1).filter((w) => w.total > 0)
  const avg = before.length ? before.reduce((a, w) => a + w.total, 0) / before.length : 0
  const dPrev = delta(cur.total, prev.total)
  const dAvg = delta(cur.total, avg)
  const maxWeek = Math.max(...history.map((w) => w.total), 1)
  const maxDay = Math.max(...cur.byDay, 1)

  const refRows = useMemo(() => {
    const rows = []
    const label = (area, id) => {
      const src = area === 'uni' ? db.subjects : area === 'work' ? db.projects : []
      return src.find((x) => x.id === id) || null
    }
    for (const [key, secs] of cur.byRef) {
      const [area, id] = key.split(':')
      const ref = label(area, id)
      const prevSecs = prev.byRef.get(key) || 0
      rows.push({
        key, area, name: ref?.name || AREAS[area]?.label || 'Otros',
        color: ref?.color || AREAS[area]?.color, secs, prevSecs, d: delta(secs, prevSecs),
      })
    }
    return rows.sort((a, b) => b.secs - a.secs)
  }, [cur, prev, db])

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Resumen semanal</div>
          <h2>{offset === 0 ? 'Esta semana' : offset === 1 ? 'Semana pasada' : weekLabel(monday)}</h2>
          <p className="mono dim" style={{ fontSize: 12 }}>{cur.start} → {cur.end}</p>
        </div>
        <div className="row">
          <button className="btn ghost icon" onClick={() => setOffset(offset + 1)}><Icon name="chevronL" size={15} /></button>
          <button className="btn sm" onClick={() => setOffset(0)} disabled={offset === 0}>Actual</button>
          <button className="btn ghost icon" onClick={() => setOffset(Math.max(0, offset - 1))} disabled={offset === 0}><Icon name="chevronR" size={15} /></button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12, borderLeft: '3px solid var(--accent)' }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>El resumen en una frase</div>
        <p className="display" style={{ fontSize: 17, margin: 0, maxWidth: '90ch', lineHeight: 1.35 }}>
          {narrative(cur, prev, avg, refRows, db)}
        </p>
      </div>

      <div className="grid-3" style={{ marginBottom: 12 }}>
        <div className="stat">
          <div className="eyebrow">Total de la semana</div>
          <div className="value num">{(cur.total / 3600).toFixed(1)}<span>h</span></div>
          <div className={`delta ${dPrev > 0 ? 'up' : dPrev < 0 ? 'down' : 'dim'}`}>
            {prev.total === 0 ? <span className="dim">sin semana previa</span> : <><Icon name={dPrev > 0 ? 'arrowUp' : 'arrowDown'} size={11} /> {pct(dPrev)} vs. semana anterior ({dur(prev.total)})</>}
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">Frente a tu media</div>
          <div className="value num">{avg ? `${(avg / 3600).toFixed(1)}` : '—'}<span>h media</span></div>
          <div className={`delta ${dAvg > 0 ? 'up' : dAvg < 0 ? 'down' : 'dim'}`}>
            {avg ? <><Icon name={dAvg > 0 ? 'arrowUp' : 'arrowDown'} size={11} /> {pct(dAvg)} sobre las últimas {before.length} semanas</> : <span className="dim">aún sin histórico</span>}
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">Constancia</div>
          <div className="value num">{cur.activeDays}<span>/7 días</span></div>
          <div className="delta dim">
            {cur.total > 0 ? `mejor día: ${DAYS_LONG[cur.best].toLowerCase()} (${dur(cur.byDay[cur.best])})` : 'ningún día registrado'}
          </div>
        </div>
      </div>

      <div className="split wide-left" style={{ marginBottom: 12 }}>
        <div className="card">
          <div className="card-head">
            <h3>Historial semanal</h3>
            <div className="seg">
              {[8, 12, 26].map((n) => (
                <button key={n} className={range === n ? 'on' : ''} onClick={() => setRange(n)}>{n} sem.</button>
              ))}
            </div>
          </div>
          <div className="bars" style={{ height: 110 }}>
            {history.map((w, i) => (
              <div className="col" key={w.start} title={`${weekLabel(w.start)} · ${dur(w.total)}`}>
                {Object.entries(AREAS).map(([k, v]) => {
                  const h = w.total ? ((w.byArea[k] || 0) / maxWeek) * 100 : 0
                  if (!h) return null
                  return <div key={k} className="seg-bar" style={{ height: `${h}%`, background: v.color, opacity: i === history.length - 1 ? 1 : 0.62 }} />
                })}
              </div>
            ))}
          </div>
          <div className="axis">
            {history.map((w, i) => (
              <span key={w.start}>{i % (range > 12 ? 4 : 2) === 0 || i === history.length - 1 ? new Date(w.start.replace(/-/g, '/')).getDate() + '/' + (new Date(w.start.replace(/-/g, '/')).getMonth() + 1) : ''}</span>
            ))}
          </div>
          <div className="row wrap" style={{ gap: 10, marginTop: 12 }}>
            {Object.entries(AREAS).map(([k, v]) => (
              <span key={k} className="row" style={{ gap: 5, fontSize: 11.5 }}>
                <span className="dot" style={{ background: v.color }} /> {v.label}
              </span>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Día a día</h3></div>
          <div className="bars" style={{ height: 80 }}>
            {cur.byDay.map((v, i) => (
              <div className="col" key={i} title={dur(v)}>
                <div className="seg-bar" style={{ height: `${(v / maxDay) * 100}%`, background: v ? 'var(--ink)' : 'var(--line)' }} />
              </div>
            ))}
          </div>
          <div className="axis">{DAYS.map((d) => <span key={d}>{d[0]}</span>)}</div>
          <hr className="hr" style={{ margin: '10px 0' }} />
          <div className="stack" style={{ gap: 9 }}>
            <Row label="Tareas completadas" value={cur.tasksDone} prev={prev.tasksDone} />
            <Row label="Clases registradas" value={cur.classes} prev={prev.classes} />
            <Row label="Asistidas" value={cur.present} prev={prev.present} />
            <Row label="Entrenos" value={cur.trainings} prev={prev.trainings} />
            <Row label="Carga de entreno" value={cur.trainingLoad} prev={prev.trainingLoad} />
          </div>
        </div>
      </div>

      <div className="split even">
      <WeeklyWork monday={cur.start} />

      <div className="card">
        <div className="card-head"><h3>Dónde ha ido el tiempo</h3><span className="dim mono" style={{ fontSize: 11 }}>vs. semana anterior</span></div>
        {refRows.length ? (
          <div className="list">
            {refRows.map((r) => (
              <div className="list-row" key={r.key}>
                <span className="dot" style={{ background: r.color }} />
                <span style={{ flex: 1, minWidth: 0 }}>{r.name}</span>
                <span className="badge">{AREAS[r.area]?.label}</span>
                <div style={{ width: 130 }} className="meter">
                  <i style={{ width: `${(r.secs / Math.max(...refRows.map((x) => x.secs))) * 100}%`, background: r.color }} />
                </div>
                <span className="mono" style={{ width: 56, textAlign: 'right' }}>{dur(r.secs)}</span>
                <span className={`mono ${r.d > 0 ? 'up' : r.d < 0 ? 'down' : 'dim'}`} style={{ width: 56, textAlign: 'right', fontSize: 11 }}>
                  {r.prevSecs === 0 ? 'nuevo' : pct(r.d)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Ninguna sesión registrada esta semana.</p>
        )}
      </div>
      </div>
    </>
  )
}

/** Cuánto del trabajo previsto para la semana llevas hecho, asignatura a asignatura. */
function WeeklyWork({ monday }) {
  const { db } = useStore()
  const wp = weekProgress(db, parseIso(monday))
  if (!wp.rows.length) return null

  return (
    <div className="card">
      <div className="card-head">
        <h3>Trabajo semanal</h3>
        <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{wp.pct}% hecho</span>
      </div>
      <div className="meter" style={{ height: 8, marginBottom: 14 }}>
        <i style={{ width: `${Math.min(100, wp.pct)}%`, background: wp.pct >= 100 ? 'var(--green)' : 'var(--ink)' }} />
      </div>
      <div className="list">
        {wp.rows
          .sort((a, b) => b.pct - a.pct)
          .map((r) => (
            <div className="list-row" key={r.subject.id}>
              <span className="dot" style={{ background: r.subject.color }} />
              <a href={`#/uni/${r.subject.id}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>{r.subject.name}</a>
              {r.tasks > 0 && <span className="badge">{r.tasksDone}/{r.tasks} entregas</span>}
              <div className="meter" style={{ width: 140 }}>
                <i style={{ width: `${Math.min(100, r.pct)}%`, background: r.subject.color }} />
              </div>
              <span className="mono dim" style={{ width: 76, textAlign: 'right', fontSize: 11 }}>{dur(r.seconds)}/{r.goal}h</span>
              <span className="mono" style={{ width: 40, textAlign: 'right', fontWeight: 600 }}>{r.pct}%</span>
            </div>
          ))}
      </div>
      <p className="dim" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
        El 100% son las horas objetivo de cada asignatura más las entregas que vencían esta semana.
        Las horas objetivo se cambian al editar la asignatura.
      </p>
    </div>
  )
}

function Row({ label, value, prev }) {
  const d = prev ? value - prev : null
  return (
    <div className="row" style={{ fontSize: 12.5 }}>
      <span className="muted">{label}</span>
      <div className="spacer" />
      <span className="num" style={{ fontSize: 17 }}>{value}</span>
      {d !== null && d !== 0 && <span className={`mono ${d > 0 ? 'up' : 'down'}`} style={{ fontSize: 11 }}>{d > 0 ? '+' : ''}{d}</span>}
    </div>
  )
}

/** Frase de resumen construida con los datos de la semana. */
function narrative(cur, prev, avg, rows, db) {
  if (cur.total === 0) return 'Esta semana no has registrado tiempo. Empieza un cronómetro desde cualquier asignatura o proyecto y aquí aparecerá el resumen.'

  const horas = (cur.total / 3600).toFixed(1)
  const top = rows[0]
  const partes = [`Has dedicado ${horas} h en ${cur.activeDays} día${cur.activeDays === 1 ? '' : 's'}`]

  if (prev.total > 0) {
    const d = (cur.total - prev.total) / prev.total
    partes.push(
      Math.abs(d) < 0.05
        ? 'prácticamente lo mismo que la semana pasada'
        : `un ${Math.abs(Math.round(d * 100))}% ${d > 0 ? 'más' : 'menos'} que la semana pasada`
    )
  }

  let frase = partes.join(', ') + '. '

  if (top) frase += `Lo que más peso ha tenido es ${top.name} con ${dur(top.secs, true)}. `

  const uni = cur.byArea.uni || 0
  const work = cur.byArea.work || 0
  if (uni && work) {
    const ratio = uni / (uni + work)
    frase += `El reparto entre estudio y trabajo fue ${Math.round(ratio * 100)}/${100 - Math.round(ratio * 100)}. `
  }

  if (cur.tasksDone) frase += `Cerraste ${cur.tasksDone} tarea${cur.tasksDone === 1 ? '' : 's'}. `
  if (cur.classes) frase += `Asististe a ${cur.present} de ${cur.classes} clases. `
  if (cur.trainings) {
    const goal = db.settings.weeklyTrainingGoal || 5
    frase += `Entrenaste ${cur.trainings} de ${goal} días (carga ${cur.trainingLoad}${
      prev.trainingLoad ? `, ${cur.trainingLoad >= prev.trainingLoad ? '+' : ''}${cur.trainingLoad - prev.trainingLoad} vs. la anterior` : ''
    }). `
  }

  const flojo = cur.byDay.findIndex((v) => v === 0)
  if (avg && cur.total < avg * 0.7) frase += 'Vas por debajo de tu media habitual: quizá toque recuperar.'
  else if (avg && cur.total > avg * 1.3) frase += 'Semana claramente por encima de tu media.'
  else if (flojo >= 0 && flojo < 5) frase += `El ${DAYS_LONG[flojo].toLowerCase()} quedó en blanco.`

  return frase.trim()
}

/* ------------------------------------------------------------ universidad */

const pctTxt = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)
const nota = (x) => (x == null ? '—' : x.toFixed(2).replace(/\.?0+$/, ''))

function Universidad() {
  const { db } = useStore()
  const u = useMemo(() => uniStats(db), [db])
  if (!u.rows.length) return <div className="empty"><div className="display">Sin asignaturas</div></div>
  const maxH = Math.max(...u.rows.map((r) => r.seconds), 1)

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid-4">
        <div className="stat">
          <div className="eyebrow">Horas de estudio</div>
          <div className="value num">{(u.seconds / 3600).toFixed(0)}<span>h</span></div>
          <div className="delta dim">en {u.rows.length} asignaturas</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Asistencia real</div>
          <div className="value num">{pctTxt(u.attendance)}</div>
          <div className="delta dim">{u.present} de {u.marked} clases · {u.absent} faltas{u.cancelled ? ` · ${u.cancelled} canceladas` : ''}</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Nota media provisional</div>
          <div className="value num">{nota(u.creditsGrade ?? u.avgGrade)}</div>
          <div className="delta dim">{u.creditsGrade != null ? 'ponderada por créditos' : 'de lo ya evaluado'}</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Sin margen de faltas</div>
          <div className="value num" style={{ color: u.atRisk.length ? 'var(--accent)' : 'var(--green)' }}>{u.atRisk.length}</div>
          <div className="delta dim">{u.atRisk.length ? u.atRisk.map((r) => r.subject.name).join(', ') : 'vas bien en todas'}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Asignatura a asignatura</h3></div>
        <div className="table-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Asignatura</th><th /><th className="r">Horas</th><th className="r">Últ. 4 sem.</th>
                <th className="r">Asistencia</th><th className="r">Faltas</th><th className="r">Margen</th>
                <th className="r">Nota</th><th className="r">Evaluado</th><th className="r">Entregas</th>
              </tr>
            </thead>
            <tbody>
              {u.rows.map((r) => (
                <tr key={r.subject.id}>
                  <td>
                    <a href={`#/uni/${r.subject.id}`} className="row" style={{ gap: 6, textDecoration: 'none' }}>
                      <span className="dot" style={{ background: r.subject.color }} />{r.subject.name}
                    </a>
                  </td>
                  <td style={{ width: '14%' }}><div className="meter"><i style={{ width: `${(r.seconds / maxH) * 100}%`, background: r.subject.color }} /></div></td>
                  <td className="r mono">{(r.seconds / 3600).toFixed(1)}</td>
                  <td className="r mono dim">{(r.seconds28 / 3600).toFixed(1)}</td>
                  <td className="r mono">{pctTxt(r.attendance)}</td>
                  <td className="r mono">{r.absent}</td>
                  <td className="r mono" style={{ color: r.budget.doomed ? 'var(--accent)' : r.budget.left <= 1 && r.budget.totalCounted ? 'var(--amber)' : '' }}>
                    {r.budget.totalCounted ? (r.budget.doomed ? '0' : r.budget.left) : '—'}
                  </td>
                  <td className="r mono">{nota(r.grade)}</td>
                  <td className="r mono dim">{r.weightDone ? `${r.weightDone}%` : '—'}</td>
                  <td className="r mono dim">{r.deliverables ? `${r.delivered}/${r.deliverables}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="dim" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
          «Margen» son las faltas que aún te puedes permitir. Las clases canceladas y las justificadas no cuentan.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ tiempo */

function Tiempo() {
  const { db } = useStore()
  const t = useMemo(() => timeStats(db), [db])
  if (!t.total) return <div className="empty"><div className="display">Sin tiempo registrado</div></div>
  const maxM = Math.max(...t.months.map((m) => m.seconds), 1)
  const maxWd = Math.max(...t.wdAvg, 1)
  const maxH = Math.max(...t.byHour, 1)
  const horas = Array.from({ length: 18 }, (_, i) => i + 6)

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid-4">
        <div className="stat">
          <div className="eyebrow">Tiempo total</div>
          <div className="value num">{(t.total / 3600).toFixed(0)}<span>h</span></div>
          <div className="delta dim">{t.first ? `desde el ${fmtDate(t.first, { absolute: true })}` : ''}</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Un día con algo</div>
          <div className="value num">{(t.avgActiveDay / 3600).toFixed(1)}<span>h de media</span></div>
          <div className="delta dim">{t.activeDays} días con tiempo apuntado</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Tu mejor día</div>
          <div className="value num" style={{ fontSize: 30 }}>{t.bestDay ? dur(t.bestDay[1]) : '—'}</div>
          <div className="delta dim">{t.bestDay ? fmtDate(t.bestDay[0], { absolute: true }) : ''}</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Racha más larga</div>
          <div className="value num">{t.bestStreak}<span>días</span></div>
          <div className="delta dim">{t.peakHour !== null ? `rindes más hacia las ${t.peakHour}:00` : ''}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Mes a mes, por áreas</h3><span className="dim mono" style={{ fontSize: 11 }}>últimos 12</span></div>
        <div className="bars" style={{ height: 150 }}>
          {t.months.map((m) => (
            <div className="col" key={m.key} title={`${MONTHS[m.month]} ${m.year}: ${dur(m.seconds)}`}>
              {Object.entries(AREAS).map(([k, v]) => {
                const h = ((m.byArea[k] || 0) / maxM) * 100
                return h ? <div key={k} className="seg-bar" style={{ height: `${h}%`, background: v.color }} /> : null
              })}
            </div>
          ))}
        </div>
        <div className="axis">{t.months.map((m) => <span key={m.key}>{MONTHS[m.month].slice(0, 3)}</span>)}</div>
        <div className="row wrap" style={{ gap: 12, marginTop: 12 }}>
          {Object.entries(AREAS).map(([k, v]) => (
            <span key={k} className="row" style={{ gap: 5, fontSize: 11.5 }}>
              <span className="dot" style={{ background: v.color }} /> {v.label} · {((t.byArea[k] || 0) / 3600).toFixed(0)} h
            </span>
          ))}
        </div>
      </div>

      <div className="split even">
        <div className="card">
          <div className="card-head"><h3>Qué día rindes más</h3><span className="dim" style={{ fontSize: 11.5 }}>media de los días con algo</span></div>
          <div className="bars" style={{ height: 120 }}>
            {t.wdAvg.map((v, i) => (
              <div className="col" key={i} title={`${DAYS_LONG[i]}: ${dur(v)} de media`}>
                <div className="seg-bar" style={{ height: `${(v / maxWd) * 100}%`, background: v === Math.max(...t.wdAvg) ? 'var(--accent)' : 'var(--ink)' }} />
              </div>
            ))}
          </div>
          <div className="axis">{DAYS.map((d, i) => <span key={d}>{d}<br />{t.wdAvg[i] ? dur(t.wdAvg[i]) : '—'}</span>)}</div>
        </div>

        <div className="card">
          <div className="card-head"><h3>A qué hora trabajas</h3><span className="dim" style={{ fontSize: 11.5 }}>solo lo medido con cronómetro</span></div>
          {t.peakHour === null ? (
            <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Usa «Trabajar en…» y aquí se verán tus horas buenas.</p>
          ) : (
            <>
              <div className="bars" style={{ height: 120, gap: 2 }}>
                {horas.map((h) => (
                  <div className="col" key={h} title={`${h}:00 · ${dur(t.byHour[h])}`}>
                    <div className="seg-bar" style={{ height: `${(t.byHour[h] / maxH) * 100}%`, background: h === t.peakHour ? 'var(--accent)' : 'var(--line-strong)' }} />
                  </div>
                ))}
              </div>
              <div className="axis" style={{ gap: 2 }}>{horas.map((h) => <span key={h}>{h % 3 === 0 ? h : ''}</span>)}</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ tareas */

function Tareas() {
  const { db } = useStore()
  const t = useMemo(() => taskStats(db), [db])
  const maxW = Math.max(...t.weeks.map((w) => Math.max(w.done, w.created)), 1)
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid-4">
        <div className="stat">
          <div className="eyebrow">Completadas</div>
          <div className="value num">{t.done}</div>
          <div className="delta dim">{t.open} abiertas · {t.overdue} atrasadas</div>
        </div>
        <div className="stat">
          <div className="eyebrow">A tiempo</div>
          <div className="value num">{pctTxt(t.onTime)}</div>
          <div className="delta dim">{t.late ? `${t.late} tarde · ${t.avgDelay.toFixed(1)} días de retraso medio` : 'ninguna tarde'}</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Entregas evaluables</div>
          <div className="value num">{t.delivered}<span>/ {t.deliverables}</span></div>
          <div className="delta dim">{t.pendingDeliverables} por entregar{t.deliveredLate ? ` · ${t.deliveredLate} marcadas tarde` : ''}</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Ritmo</div>
          <div className="value num">{(t.weeks.slice(-4).reduce((a, w) => a + w.done, 0) / 4).toFixed(1)}<span>/sem</span></div>
          <div className="delta dim">tareas cerradas, media del último mes</div>
        </div>
      </div>

      <div className="split even">
        <div className="card">
          <div className="card-head"><h3>Creadas y cerradas por semana</h3><span className="dim mono" style={{ fontSize: 11 }}>últimas 12</span></div>
          <div className="bars" style={{ height: 130 }}>
            {t.weeks.map((w) => (
              <div className="col" key={w.start} title={`${weekLabel(w.start)} · ${w.created} creadas · ${w.done} cerradas`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}>
                <div className="seg-bar" style={{ height: `${(w.created / maxW) * 100}%`, background: 'var(--line-strong)' }} />
                <div className="seg-bar" style={{ height: `${(w.done / maxW) * 100}%`, background: 'var(--green)' }} />
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 12, marginTop: 10, fontSize: 11.5 }}>
            <span className="row" style={{ gap: 5 }}><span className="dot" style={{ background: 'var(--line-strong)' }} /> creadas</span>
            <span className="row" style={{ gap: 5 }}><span className="dot" style={{ background: 'var(--green)' }} /> cerradas</span>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Por área</h3></div>
          <div className="stack" style={{ gap: 9 }}>
            {t.byArea.filter((a) => a.open || a.done).map((a) => (
              <div key={a.area} className="row" style={{ gap: 8, fontSize: 12.5 }}>
                <span className="dot" style={{ background: AREAS[a.area].color }} />
                <span style={{ width: 100 }}>{AREAS[a.area].label}</span>
                <div className="meter" style={{ flex: 1 }}>
                  <i style={{ width: `${(a.done / Math.max(1, a.done + a.open)) * 100}%`, background: AREAS[a.area].color }} />
                </div>
                <span className="mono dim" style={{ width: 110, textAlign: 'right' }}>{a.done} hechas · {a.open} abiertas</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- voluntariado */

function Voluntariado() {
  const { db } = useStore()
  const v = useMemo(() => volunteerSummary(db), [db])
  if (!v.n) return <div className="empty"><div className="display">Sin jornadas todavía</div></div>
  const maxM = Math.max(...v.months.map((m) => m.minutes), 1)
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid-4">
        <div className="stat">
          <div className="eyebrow">Horas</div>
          <div className="value num">{(v.minutes / 60).toFixed(1)}<span>h</span></div>
          <div className="delta dim">{v.n} jornadas</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Por jornada</div>
          <div className="value num">{(v.avg / 60).toFixed(1)}<span>h</span></div>
          <div className="delta dim">de media</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Fotos</div>
          <div className="value num">{v.photos}</div>
          <div className="delta dim">{v.noPhoto ? `${v.noPhoto} jornadas sin ninguna` : 'todas acreditadas'}</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Última vez</div>
          <div className="value num" style={{ fontSize: 26 }}>{v.last ? fmtDate(v.last.date) : '—'}</div>
          <div className="delta dim">{v.wd.some((x) => x) ? `sueles ir los ${DAYS_LONG[v.wd.indexOf(Math.max(...v.wd))].toLowerCase()}` : ''}</div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Horas por mes</h3><span className="dim mono" style={{ fontSize: 11 }}>últimos 12</span></div>
        <div className="bars" style={{ height: 130 }}>
          {v.months.map((m) => (
            <div className="col" key={m.key} title={`${MONTHS[m.month]} ${m.year}: ${(m.minutes / 60).toFixed(1)} h · ${m.n} jornadas`}>
              <div className="seg-bar" style={{ height: `${(m.minutes / maxM) * 100}%`, background: AREAS.volunteer.color }} />
            </div>
          ))}
        </div>
        <div className="axis">{v.months.map((m) => <span key={m.key}>{MONTHS[m.month].slice(0, 3)}</span>)}</div>
      </div>
    </div>
  )
}
