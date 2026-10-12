import React, { useMemo, useState } from 'react'
import Icon from './Icon.jsx'
import { useStore } from '../lib/store.jsx'
import { fmtDate } from '../lib/date.js'
import { correlations, readings } from '../lib/correlations.js'
import { ecosVsRpe, weeklyEcos, ECOS_COEF } from '../lib/ecos.js'

const TONO = {
  bien: { ico: 'check', color: 'var(--green)' },
  ojo: { ico: 'alert', color: 'var(--amber)' },
  mal: { ico: 'x', color: 'var(--accent)' },
}

/** Lo que dicen tus datos del reloj, en frases, de lo urgente a lo bueno. */
export function Lecturas({ max = 8, className = 'card' }) {
  const { db } = useStore()
  const ls = useMemo(() => readings(db), [db])
  return (
    <div className={className}>
      <div className="card-head"><h3>Lo que dicen tus datos</h3><span className="dim" style={{ fontSize: 11.5 }}>últimas semanas</span></div>
      <div className="fill">
        {ls.length ? ls.slice(0, max).map((l, i) => (
          <div key={i} className="lectura">
            <span className="ico" style={{ color: TONO[l.tono].color, borderColor: TONO[l.tono].color }}><Icon name={TONO[l.tono].ico} size={11} /></span>
            <div>
              <div className="titulo">{l.titulo}</div>
              <div className="dim texto">{l.texto}</div>
            </div>
          </div>
        )) : <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Hacen falta unos días de datos del reloj y de entrenos.</p>}
      </div>
    </div>
  )
}

const FUERZA_COLOR = { fuerte: 'var(--accent)', moderada: 'var(--amber)', débil: 'var(--ink-3)', ninguna: 'var(--line-strong)' }

/**
 * Qué se relaciona con qué en tus datos. Arriba las relaciones claras; las
 * que no tienen datos suficientes, plegadas al final con lo que les falta.
 */
export function Correlaciones({ className = 'card', limite = 6 }) {
  const { db } = useStore()
  const cs = useMemo(() => correlations(db), [db])
  const [todas, setTodas] = useState(false)
  const claras = cs.filter((c) => c.r != null && Math.abs(c.r) >= 0.25)
  const sinRelacion = cs.filter((c) => c.r != null && Math.abs(c.r) < 0.25)
  const faltan = cs.filter((c) => c.r == null)
  const visibles = todas ? claras : claras.slice(0, limite)

  return (
    <div className={className}>
      <div className="card-head">
        <h3>Qué se relaciona con qué</h3>
        <span className="dim" style={{ fontSize: 11.5 }}>{claras.length} relaciones claras</span>
      </div>
      <div className="fill">
        {visibles.map((c) => (
          <div key={c.x + c.y + c.lag} className="corr">
            <div className="row" style={{ gap: 8 }}>
              <strong style={{ fontSize: 13, flex: 1 }}>{c.que}</strong>
              <span className="badge" style={{ color: FUERZA_COLOR[c.fuerza], borderColor: FUERZA_COLOR[c.fuerza] }}>{c.fuerza}</span>
              <span className="dim mono" style={{ fontSize: 10.5 }} title="Días con los dos datos">{c.n} d</span>
            </div>
            <div style={{ fontSize: 12.5, marginTop: 3 }}>{c.frase}</div>
            {c.implica && <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>→ {c.implica}</div>}
          </div>
        ))}
        {claras.length > limite && (
          <button className="btn sm ghost" onClick={() => setTodas(!todas)}>{todas ? 'Ver menos' : `Ver las ${claras.length}`}</button>
        )}
        {!claras.length && (
          <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
            Todavía no hay relaciones claras. Cuantos más días tengan reloj y entreno apuntado (con RPE y CMJ), más cosas salen aquí.
          </p>
        )}
        {(sinRelacion.length > 0 || faltan.length > 0) && (
          <details style={{ marginTop: 10 }}>
            <summary className="dim" style={{ cursor: 'pointer', fontSize: 12 }}>Sin relación o sin datos suficientes ({sinRelacion.length + faltan.length})</summary>
            <div className="stack" style={{ gap: 4, marginTop: 6 }}>
              {sinRelacion.map((c) => <div key={c.x + c.y + c.lag} className="dim" style={{ fontSize: 12 }}>· {c.que}: sin relación ({c.n} días)</div>)}
              {faltan.map((c) => <div key={c.x + c.y + c.lag} className="dim" style={{ fontSize: 12 }}>· {c.que}: faltan {c.faltan} días con los dos datos</div>)}
            </div>
          </details>
        )}
        <p className="dim" style={{ fontSize: 11, margin: '10px 0 0' }}>
          Relación no es causa: dice qué va junto en tus datos. Se compara el tercio de días más alto con el más bajo.
        </p>
      </div>
    </div>
  )
}

/**
 * ECOs (carga objetiva por zonas de pulso) frente a tu RPE. Dice si tu
 * percepción es fiable y qué sesiones te costaron más de lo que fueron.
 */
export function EcosCard({ className = 'card' }) {
  const { db } = useStore()
  const e = useMemo(() => ecosVsRpe(db), [db])
  const semanas = useMemo(() => weeklyEcos(db, 10), [db])
  const max = Math.max(1, ...semanas.map((s) => s.ecos))
  const maxS = Math.max(1, ...semanas.map((s) => s.srpe))
  return (
    <div className={className}>
      <div className="card-head">
        <h3>Carga objetiva (ECOs) y tu RPE</h3>
        <span className="dim" style={{ fontSize: 11.5 }} title={`Minutos en cada zona de pulso × ${ECOS_COEF.join(', ')} (Cejuela y Esteve-Lanao, 2011)`}>zonas de pulso del reloj</span>
      </div>
      <div className="fill">
        {e.n < 4 ? (
          <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
            Hacen falta al menos 4 entrenos con actividad del reloj (con pulso) y RPE. Llevas {e.n}. La carga objetiva sale del tiempo en cada zona
            de pulso; la tuya, del RPE × minutos: comparar las dos dice si tu percepción es fiable.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 13, marginTop: 0 }}>
              {e.r >= 0.6 ? <>Tu RPE va <b>muy en línea</b> con la carga objetiva (r = {e.r.toFixed(2)}): tu percepción es fiable.</>
                : e.r >= 0.35 ? <>Tu RPE va <b>bastante en línea</b> con la carga objetiva (r = {e.r.toFixed(2)}).</>
                : <>Tu RPE <b>no sigue</b> a la carga objetiva (r = {e.r?.toFixed(2) ?? '—'}): o el RPE se apunta deprisa, o hay sesiones (gimnasio, técnica) donde el pulso no refleja el esfuerzo.</>}
            </p>
            {e.masDuras.length > 0 && (
              <>
                <div className="eyebrow">Te costaron más de lo que fueron</div>
                {e.masDuras.slice(0, 3).map((f) => (
                  <div key={f.t.id} className="row" style={{ gap: 8, fontSize: 12.5 }}>
                    <span className="dim" style={{ width: 70 }}>{fmtDate(f.t.date)}</span>
                    <span style={{ flex: 1 }}>{f.t.type} · RPE {f.t.rpe}</span>
                    <span className="mono" style={{ color: 'var(--accent)' }}>+{Math.round(f.desvio)} %</span>
                  </div>
                ))}
                <p className="dim" style={{ fontSize: 11.5, margin: '4px 0 8px' }}>Días así suelen coincidir con mal sueño, calor o fatiga acumulada.</p>
              </>
            )}
          </>
        )}
        <div className="eyebrow" style={{ marginTop: 6 }}>Semana a semana: ECOs (verde) y RPE × min (gris)</div>
        <div className="bars" style={{ height: 70, gap: 3 }}>
          {semanas.map((s) => (
            <div className="col" key={s.start} title={`ECOs ${s.ecos} · RPE×min ${s.srpe}`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}>
              <div className="seg-bar" style={{ height: `${(s.ecos / max) * 100}%`, background: 'var(--green)' }} />
              <div className="seg-bar" style={{ height: `${(s.srpe / maxS) * 100}%`, background: 'var(--line-strong)' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
