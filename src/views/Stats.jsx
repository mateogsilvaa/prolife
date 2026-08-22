import React, { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { useStore, AREAS } from '../lib/store.jsx'
import { weekSummary, recentWeeks, weekProgress, delta, pct } from '../lib/stats.js'
import { dur, DAYS, DAYS_LONG, startOfWeek, addDays, weekLabel, iso, parseIso, MONTHS } from '../lib/date.js'

export default function Stats() {
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

      <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--accent)' }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>El resumen en una frase</div>
        <p className="display" style={{ fontSize: 21, margin: 0, maxWidth: '62ch', lineHeight: 1.35 }}>
          {narrative(cur, prev, avg, refRows, db)}
        </p>
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
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

      <div className="split wide-left" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-head">
            <h3>Historial semanal</h3>
            <div className="seg">
              {[8, 12, 26].map((n) => (
                <button key={n} className={range === n ? 'on' : ''} onClick={() => setRange(n)}>{n} sem.</button>
              ))}
            </div>
          </div>
          <div className="bars" style={{ height: 160 }}>
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
          <div className="bars" style={{ height: 130 }}>
            {cur.byDay.map((v, i) => (
              <div className="col" key={i} title={dur(v)}>
                <div className="seg-bar" style={{ height: `${(v / maxDay) * 100}%`, background: v ? 'var(--ink)' : 'var(--line)' }} />
              </div>
            ))}
          </div>
          <div className="axis">{DAYS.map((d) => <span key={d}>{d[0]}</span>)}</div>
          <hr className="hr" style={{ margin: '16px 0' }} />
          <div className="stack" style={{ gap: 9 }}>
            <Row label="Tareas completadas" value={cur.tasksDone} prev={prev.tasksDone} />
            <Row label="Clases registradas" value={cur.classes} prev={prev.classes} />
            <Row label="Asistidas" value={cur.present} prev={prev.present} />
            <Row label="Entrenos" value={cur.trainings} prev={prev.trainings} />
            <Row label="Carga de entreno" value={cur.trainingLoad} prev={prev.trainingLoad} />
          </div>
        </div>
      </div>

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
    </>
  )
}

/** Cuánto del trabajo previsto para la semana llevas hecho, asignatura a asignatura. */
function WeeklyWork({ monday }) {
  const { db } = useStore()
  const wp = weekProgress(db, parseIso(monday))
  if (!wp.rows.length) return null

  return (
    <div className="card" style={{ marginBottom: 20 }}>
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
