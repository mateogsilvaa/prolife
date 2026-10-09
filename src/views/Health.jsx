import React, { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { TrainingForm } from './Training.jsx'
import { useStore, uid } from '../lib/store.jsx'
import { DAYS, DAYS_LONG, fmtDate, parseIso, today } from '../lib/date.js'
import {
  healthStats, hrs, clockOf, lastDays, hasHealth, activityLabel, activityLine, km, pace,
  guessTrainingType, activityNote,
} from '../lib/health.js'
import { useGarmin, GarminConnect } from '../components/Garmin.jsx'

const FASES = [
  ['deep', 'Profundo', '#2f4b6e'],
  ['light', 'Ligero', '#6f8fb5'],
  ['rem', 'REM', '#9b7bb8'],
  ['awake', 'Despierto', '#d9b26a'],
]

/**
 * Salud: lo que mide el reloj. Sueño, pasos, pulso en reposo, estrés y Body
 * Battery, y cómo se cruza con los entrenos. Los datos los trae la app de
 * escritorio desde Garmin Connect (ver `electron/garmin.js`).
 */
export default function Health() {
  const { db } = useStore()
  const g = useGarmin()
  const st = useMemo(() => healthStats(db), [db])
  const [training, setTraining] = useState(null)

  if (!hasHealth(db)) {
    return (
      <>
        <div className="page-head">
          <div><div className="eyebrow">Salud</div><h2>Tu reloj</h2></div>
        </div>
        <div className="empty">
          <div className="display">Todavía no hay datos del reloj</div>
          <p style={{ maxWidth: '52ch', margin: '0 auto 14px' }}>
            Conecta Garmin Connect y aquí verás el sueño de cada noche, los pasos, el pulso en reposo,
            el estrés y la Body Battery, además de tus carreras listas para apuntarlas como entreno.
          </p>
          <GarminConnect g={g} />
        </div>
      </>
    )
  }

  const noches = st.d30
  const maxSueno = Math.max(...noches.map((x) => x.w?.sleep?.seconds || 0), 9 * 3600)
  const maxPasos = Math.max(...noches.map((x) => x.w?.steps || 0), st.stepGoal || 0, 1)
  const reposo = st.d60.map((x) => x.w?.restingHr).filter((v) => v > 0)
  const ultimo = st.ultimoSueno
  const actividades = [...(db.garminActivities || [])].sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')))

  const apuntar = (a) => {
    const existente = db.training.find((t) => t.date === a.date)
    const nota = activityNote(a)
    setTraining(existente
      ? { ...existente, notes: existente.notes?.includes(nota) ? existente.notes : [existente.notes, nota].filter(Boolean).join('\n'), garminId: a.id }
      : {
          id: uid('tr'), date: a.date, done: true, type: guessTrainingType(a, db.settings.trainingTypes || []),
          minutes: Math.round((a.seconds || 0) / 60), rpe: 5, cmjPre: '', cmjPost: '', notes: nota, pains: [], garminId: a.id,
        })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Salud · Garmin</div>
          <h2>Tu reloj</h2>
          <p>{g.estado?.ultima ? `Última sincronización: ${new Date(g.estado.ultima.at).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Datos traídos desde Garmin Connect.'}</p>
        </div>
        {g.disponible && g.estado?.conectado && (
          <button className="btn" disabled={g.ocupado} onClick={g.sincronizar}>
            <Icon name="refresh" size={13} /> {g.ocupado ? 'Trayendo…' : 'Sincronizar'}
          </button>
        )}
      </div>

      {g.disponible && !g.estado?.conectado && (
        <div className="notice err" style={{ marginBottom: 16 }}>
          <Icon name="x" size={13} />
          <span style={{ fontSize: 12.5 }}>La sesión de Garmin ha caducado: lo de aquí es lo último que se trajo.</span>
          <div className="spacer" />
          <GarminConnect g={g} compact />
        </div>
      )}

      <div className="grid-4" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="eyebrow">Sueño · media 7 días</div>
          <div className="value num" style={{ fontSize: 32 }}>{hrs(st.sleep7)}</div>
          <div className="delta dim">30 días: {hrs(st.sleep30)} · {st.shortNights} noches de menos de 6 h 30</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Pasos · media 7 días</div>
          <div className="value num">{st.steps7 != null ? Math.round(st.steps7).toLocaleString('es') : '—'}</div>
          <div className="delta dim">hoy {st.stepsHoy != null ? st.stepsHoy.toLocaleString('es') : '—'}{st.stepGoal ? ` de ${st.stepGoal.toLocaleString('es')}` : ''}</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Pulso en reposo</div>
          <div className="value num" style={{ color: st.restHoy && st.restBase && st.restHoy - st.restBase >= 6 ? 'var(--accent)' : '' }}>
            {st.restHoy ?? '—'}<span>ppm</span>
          </div>
          <div className="delta dim">
            {st.restBase ? `tu base: ${Math.round(st.restBase)}${st.restHoy ? ` (${st.restHoy - Math.round(st.restBase) >= 0 ? '+' : ''}${st.restHoy - Math.round(st.restBase)})` : ''}` : 'sin base todavía'}
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">Estrés · Body Battery</div>
          <div className="value num">{st.stress7 != null ? Math.round(st.stress7) : '—'}<span>estrés</span></div>
          <div className="delta dim">
            {st.bbHoy?.high != null ? `Body Battery hoy: ${st.bbHoy.low ?? '—'} → ${st.bbHoy.high}` : 'media de 7 días (0–100)'}
          </div>
        </div>
      </div>

      <div className="split even" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-head">
            <h3>La última noche</h3>
            {ultimo?.score != null && <span className="badge">puntuación {ultimo.score}</span>}
          </div>
          {ultimo ? (
            <>
              <div className="row" style={{ gap: 20, alignItems: 'baseline', marginBottom: 12 }}>
                <div className="num" style={{ fontSize: 34 }}>{hrs(ultimo.seconds)}</div>
                <div className="dim" style={{ fontSize: 13 }}>{clockOf(ultimo.start)} → {clockOf(ultimo.end)}</div>
              </div>
              <FasesBar s={ultimo} />
              <div className="row wrap" style={{ gap: 14, marginTop: 10 }}>
                {FASES.map(([k, l, c]) => ultimo[k] != null && (
                  <span key={k} className="row" style={{ gap: 5, fontSize: 12 }}>
                    <span className="dot" style={{ background: c }} />{l} {hrs(ultimo[k])}
                  </span>
                ))}
              </div>
              <p className="dim" style={{ fontSize: 12, margin: '12px 0 0' }}>
                Te acuestas de media a las <b>{st.bedtime || '—'}</b> y te levantas a las <b>{st.wake || '—'}</b> (últimos 30 días).
              </p>
            </>
          ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Sin sueño registrado. ¿Dormiste con el reloj?</p>}
        </div>

        <div className="card">
          <div className="card-head"><h3>Sueño y entreno</h3></div>
          {st.trainingVsSleep ? (
            <>
              <p style={{ fontSize: 13, marginTop: 0, lineHeight: 1.6 }}>
                Después de dormir <b>menos de 7 h</b> tu RPE medio es <b>{st.trainingVsSleep.rpeCorta.toFixed(1)}</b>, frente
                a <b>{st.trainingVsSleep.rpeNormal.toFixed(1)}</b> cuando duermes más. Con molestias:{' '}
                <b>{Math.round(st.trainingVsSleep.dolorCorta * 100)}%</b> de los entrenos tras noche corta,{' '}
                <b>{Math.round(st.trainingVsSleep.dolorNormal * 100)}%</b> tras noche normal.
              </p>
              <p className="dim" style={{ fontSize: 11.5, margin: 0 }}>
                {st.trainingVsSleep.corta} entrenos tras noche corta y {st.trainingVsSleep.normal} tras noche normal.
              </p>
            </>
          ) : (
            <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
              Cuando haya al menos tres entrenos tras una noche corta y tres tras una normal, aquí verás
              si dormir poco te hace entrenar peor o te trae más molestias.
            </p>
          )}
          <hr className="hr" style={{ margin: '14px 0' }} />
          <div className="eyebrow" style={{ marginBottom: 6 }}>Qué día duermes y te mueves más</div>
          <div className="table-wrap">
            <table className="tabla">
              <thead><tr><th /> {DAYS.map((d) => <th key={d} className="r">{d}</th>)}</tr></thead>
              <tbody>
                <tr><td className="dim">Sueño</td>{st.wdSueno.map((v, i) => <td key={i} className="r mono">{v ? (v / 3600).toFixed(1) : '—'}</td>)}</tr>
                <tr><td className="dim">Pasos</td>{st.wdPasos.map((v, i) => <td key={i} className="r mono">{v ? `${(v / 1000).toFixed(1)}k` : '—'}</td>)}</tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head"><h3>Sueño por noche</h3><span className="dim mono" style={{ fontSize: 11 }}>últimos 30 días</span></div>
        <div className="bars" style={{ height: 150 }}>
          {noches.map((x) => {
            const s = x.w?.sleep
            return (
              <div className="col" key={x.date} title={`${fmtDate(x.date, { absolute: true })}: ${s ? hrs(s.seconds) : 'sin datos'}`}>
                {s && (s.deep != null || s.light != null)
                  ? [...FASES].reverse().map(([k, , c]) => s[k] ? <div key={k} className="seg-bar" style={{ height: `${(s[k] / maxSueno) * 100}%`, background: c }} /> : null)
                  : s?.seconds ? <div className="seg-bar" style={{ height: `${(s.seconds / maxSueno) * 100}%`, background: '#6f8fb5' }} /> : null}
              </div>
            )
          })}
        </div>
        <div className="axis">{noches.map((x, i) => <span key={x.date}>{i % 5 === 4 ? parseIso(x.date).getDate() : ''}</span>)}</div>
      </div>

      <div className="split even" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-head"><h3>Pasos por día</h3><span className="dim mono" style={{ fontSize: 11 }}>30 días</span></div>
          <div className="bars" style={{ height: 120 }}>
            {noches.map((x) => (
              <div className="col" key={x.date} title={`${fmtDate(x.date, { absolute: true })}: ${x.w?.steps?.toLocaleString('es') ?? '—'} pasos`}>
                <div className="seg-bar" style={{
                  height: `${((x.w?.steps || 0) / maxPasos) * 100}%`,
                  background: x.w?.steps >= (x.w?.stepGoal || st.stepGoal || Infinity) ? 'var(--green)' : 'var(--line-strong)',
                }} />
              </div>
            ))}
          </div>
          <p className="dim" style={{ fontSize: 11.5, margin: '10px 0 0' }}>En verde, los días que llegaste al objetivo de pasos del reloj.</p>
        </div>

        <div className="card">
          <div className="card-head"><h3>Pulso en reposo</h3><span className="dim mono" style={{ fontSize: 11 }}>60 días</span></div>
          {reposo.length >= 2 ? (
            <>
              <Linea valores={reposo} />
              <p className="dim" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
                Si sube varias pulsaciones por encima de tu base varios días seguidos suele ser cansancio
                acumulado, mal descanso o que te estás poniendo malo: buen momento para bajar carga.
              </p>
            </>
          ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Hacen falta unos cuantos días de datos.</p>}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Actividades del reloj</h3><span className="badge">{actividades.length}</span></div>
        {actividades.length ? (
          <div className="list">
            {actividades.slice(0, 30).map((a) => {
              const apuntado = db.training.find((t) => t.date === a.date && t.done)
              return (
                <div key={a.id} className="list-row">
                  <span className="dim" style={{ width: 74 }}>{fmtDate(a.date)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13 }}>{a.name || activityLabel(a)}</div>
                    <div className="dim" style={{ fontSize: 11.5 }}>
                      {activityLine(a)}{a.aerobicTE ? ` · efecto aeróbico ${a.aerobicTE.toFixed(1)}` : ''}
                    </div>
                  </div>
                  {apuntado
                    ? <button className="btn sm ghost" title={`Ya hay un entreno ese día (${apuntado.type}): añadir los datos del reloj a sus notas`} onClick={() => apuntar(a)}>
                        <Icon name="check" size={11} /> {apuntado.type}
                      </button>
                    : <button className="btn sm" onClick={() => apuntar(a)}><Icon name="plus" size={11} /> Apuntar</button>}
                </div>
              )
            })}
          </div>
        ) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Sin actividades todavía.</p>}
      </div>

      {training && <TrainingForm entry={training} onClose={() => setTraining(null)} />}
    </>
  )
}

export function FasesBar({ s, height = 12 }) {
  const total = FASES.reduce((a, [k]) => a + (s[k] || 0), 0) || s.seconds || 1
  return (
    <div style={{ display: 'flex', height, borderRadius: 6, overflow: 'hidden', background: 'var(--line)' }}>
      {FASES.map(([k, l, c]) => s[k] ? <div key={k} title={`${l}: ${hrs(s[k])}`} style={{ width: `${(s[k] / total) * 100}%`, background: c }} /> : null)}
    </div>
  )
}

function Linea({ valores }) {
  const min = Math.min(...valores) - 2
  const max = Math.max(...valores) + 2
  const x = (i) => (i / (valores.length - 1)) * 100
  const y = (v) => 100 - ((v - min) / (max - min || 1)) * 100
  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: 110 }}>
        <polyline points={valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="row dim mono" style={{ fontSize: 11 }}>
        <span>mín {Math.min(...valores)}</span><div className="spacer" /><span>máx {Math.max(...valores)}</span>
      </div>
    </>
  )
}
