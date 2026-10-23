import { today, parseIso } from './date.js'

/**
 * Lo que llega de la app de tu entrenador (RB Team). Los formularios, series y
 * molestias ya están dentro de cada entreno (`training[].rb`); aquí, lo demás,
 * que vive en `db.coach` tal cual lo manda su app.
 */

/** Las caritas del formulario del grupo, de 1 a 5 (5 es lo bueno). */
export const CARAS = {
  energia: ['Agotado', 'Cansado', 'Normal', 'Bien', 'A tope'],
  ganas: ['Ninguna', 'Pocas', 'Normales', 'Bastantes', 'Muchas'],
  sensaciones: ['Muy malas', 'Malas', 'Normales', 'Buenas', 'Muy buenas'],
}
export const cara = (k, v) => CARAS[k]?.[Number(v) - 1] || null

/** Sesiones que te ha puesto el entrenador para un día. */
export const planDel = (db, date) => (db.coach?.sesionesSeriesAsignadas || []).filter((s) => s.fecha === date)

/** «Velocidad y saltos: 5x300 r4'». */
export const planTexto = (s) =>
  [s.titulo, ...(s.bloques || []).map((b) => [b.grupo, b.notacion].filter(Boolean).join(': '))].filter(Boolean).join(' · ') || 'Sesión del entrenador'

/** El bloque de entrenamiento en el que estás y en qué semana de él. */
export function bloqueActual(db, date = today()) {
  const b = (db.coach?.bloquesEntrenamiento || []).find((x) => (x.inicio || x.inicioBloque) <= date && date <= (x.fin || x.finBloque))
  if (!b) return null
  const inicio = b.inicio || b.inicioBloque
  const semana = Math.floor((parseIso(date) - parseIso(inicio)) / (7 * 86400000)) + 1
  return { nombre: b.nombre || 'Bloque', semana, semanas: Number(b.semanas) || null, fin: b.fin || b.finBloque }
}

/** «Preparación general · semana 3 de 4». */
export const bloqueTexto = (b) => (b ? `${b.nombre} · semana ${b.semana}${b.semanas ? ` de ${b.semanas}` : ''}` : '')
