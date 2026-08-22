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
    // se avanza semana a semana desde el lunes de la semana de inicio
    let weekStart = addDays(start, -weekday(start))
    let guard = 0
    while (weekStart <= limit && guard++ < MAX) {
      const weeksApart = Math.round((weekStart - addDays(start, -weekday(start))) / 604800000)
      if (weeksApart % interval === 0) {
        for (const d of days) {
          const day = addDays(weekStart, d)
          if (day >= start && day >= from && day <= limit) out.push(iso(day))
        }
      }
      weekStart = addDays(weekStart, 7)
    }
  } else if (r.freq === 'daily') {
    let d = new Date(start)
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
