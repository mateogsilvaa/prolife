import { iso, parseIso, addDays, weekday } from './date.js'

export const FREQ = [
  { id: '', label: 'No se repite' },
  { id: 'daily', label: 'Cada día' },
  { id: 'weekly', label: 'Cada semana' },
  { id: 'monthly', label: 'Cada mes' },
  { id: 'yearly', label: 'Cada año' },
]

export function repeatLabel(repeat) {
  if (!repeat?.freq) return null
  const n = repeat.interval || 1
  const base =
    repeat.freq === 'daily' ? (n === 1 ? 'cada día' : `cada ${n} días`)
    : repeat.freq === 'weekly' ? (n === 1 ? 'cada semana' : `cada ${n} semanas`)
    : repeat.freq === 'monthly' ? (n === 1 ? 'cada mes' : `cada ${n} meses`)
    : n === 1 ? 'cada año' : `cada ${n} años`
  const days = repeat.freq === 'weekly' && repeat.byday?.length
    ? ` (${repeat.byday.map((d) => ['L', 'M', 'X', 'J', 'V', 'S', 'D'][d]).join(' ')})`
    : ''
  const until = repeat.until ? `, hasta ${repeat.until}` : ''
  return base + days + until
}

/**
 * Días enteros entre dos medianoches locales. Con `Math.round` y no una
 * división a secas: cruzando un cambio de hora la diferencia no da un número
 * entero de días, y ahí un `ceil` a pelo se saltaría una aparición.
 */
const daysBetween = (a, b) => Math.round((b - a) / 86400000)

/**
 * Expande un evento repetido a las fechas concretas que caen dentro del rango.
 * Las fechas en `exceptions` se saltan (sirve para "este día no").
 */
export function occurrences(event, fromIso, toIso) {
  const out = []
  const from = parseIso(fromIso)
  const to = parseIso(toIso)
  const start = parseIso(event.date)
  const r = event.repeat

  if (!r?.freq) {
    if (event.date >= fromIso && event.date <= toIso) out.push(event.date)
    return out.filter((d) => !(event.exceptions || []).includes(d))
  }

  const interval = Math.max(1, r.interval || 1)
  const until = r.until ? parseIso(r.until) : null
  const limit = until && until < to ? until : to
  const MAX = 800

  if (r.freq === 'weekly') {
    const days = r.byday?.length ? r.byday : [weekday(start)]
    const base = addDays(start, -weekday(start))
    // Se empieza en la semana de `from`, no en la del primer día de la serie:
    // recorrerla entera cuesta tantas vueltas como semanas lleve viva, y la
    // vista de mes pide 42 días uno a uno. Se redondea hacia abajo a un
    // múltiplo del intervalo para que la comprobación de abajo siga valiendo.
    // Hacia abajo las dos veces: primero a la semana que CONTIENE `from` (no a
    // la más cercana, que se saltaría la de en curso), y luego al múltiplo del
    // intervalo anterior, para no colarse por delante de una semana buena.
    const weeksAhead = Math.floor(daysBetween(base, from) / 7)
    let weekStart = weeksAhead > 0 ? addDays(base, Math.floor(weeksAhead / interval) * interval * 7) : base
    let guard = 0
    while (weekStart <= limit && guard++ < MAX) {
      const weeksApart = Math.round((weekStart - base) / 604800000)
      if (weeksApart % interval === 0) {
        for (const d of days) {
          const day = addDays(weekStart, d)
          if (day >= start && day >= from && day <= limit) out.push(iso(day))
        }
      }
      weekStart = addDays(weekStart, 7)
    }
  } else if (r.freq === 'daily') {
    // Igual: se salta directamente a la primera aparición dentro de la ventana.
    // Recorriendo desde el principio, el tope de MAX acababa cortando la serie
    // por el camino y el evento dejaba de salir en el calendario sin avisar.
    const ahead = daysBetween(start, from)
    let d = ahead > 0 ? addDays(start, Math.ceil(ahead / interval) * interval) : new Date(start)
    let guard = 0
    while (d <= limit && guard++ < MAX) {
      if (d >= from) out.push(iso(d))
      d = addDays(d, interval)
    }
  } else if (r.freq === 'monthly') {
    let guard = 0
    for (let i = 0; guard++ < MAX; i += interval) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, start.getDate())
      if (d > limit) break
      if (d >= from && d.getDate() === start.getDate()) out.push(iso(d))
    }
  } else if (r.freq === 'yearly') {
    let guard = 0
    for (let i = 0; guard++ < MAX; i += interval) {
      const d = new Date(start.getFullYear() + i, start.getMonth(), start.getDate())
      if (d > limit) break
      if (d >= from) out.push(iso(d))
    }
  }

  const skip = new Set(event.exceptions || [])
  return [...new Set(out)].filter((d) => !skip.has(d)).sort()
}

/** Todas las apariciones de todos los eventos dentro de un rango de fechas. */
export function expandEvents(events, fromIso, toIso) {
  const out = []
  for (const e of events || []) {
    for (const date of occurrences(e, fromIso, toIso)) {
      out.push({ ...e, date, baseDate: e.date, repeated: date !== e.date })
    }
  }
  return out
}
