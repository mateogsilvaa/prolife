/**
 * Qué avisar y cuándo.
 *
 * Lo usan dos sitios, por eso vive aquí y no importa nada de la interfaz:
 *  - el servidor del ordenador, que cada minuto mira qué toca y lo manda como
 *    notificación de Windows y como aviso push al iPhone;
 *  - la tablet, que al abrirse programa en el propio aparato los avisos de los
 *    próximos días (funcionan aunque la app esté cerrada).
 *
 * Dos clases de avisos:
 *  - **programados**: tienen una hora fija que se puede saber de antemano (la
 *    entrega de mañana, el examen del jueves, la competición del sábado);
 *  - **del momento**: el resumen de la mañana y el repaso de la noche, que
 *    miran cómo está el día justo entonces (¿has marcado la asistencia? ¿has
 *    apuntado el entreno?).
 */

export const AVISOS_POR_DEFECTO = {
  activos: true,
  resumen: '08:00',
  noche: '21:30',
  entregas: true,
  examenes: true,
  competiciones: true,
  asistencia: true,
  entreno: true,
  diario: true,
  eventos: false,
}

export const ajustesAvisos = (db) => ({ ...AVISOS_POR_DEFECTO, ...(db?.settings?.avisos || {}) })

const pad = (n) => String(n).padStart(2, '0')
const isoDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const deIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const masDias = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return isoDe(d) }
const a = (fecha, hhmm) => { const [h, m] = String(hhmm || '20:00').split(':').map(Number); const d = deIso(fecha); d.setHours(h || 0, m || 0, 0, 0); return d.getTime() }
const diaSemana = (s) => (deIso(s).getDay() + 6) % 7
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/** Clases que hay un día según el horario (sin festivos ni cuatrimestre fuera). */
function clasesDe(db, fecha) {
  const wd = diaSemana(fecha)
  const enFestivo = (db.holidays || []).some((h) => fecha >= h.from && fecha <= (h.to || h.from))
  if (enFestivo) return []
  const out = []
  for (const s of db.subjects || []) {
    ;(s.schedule || []).forEach((sl, i) => {
      if (sl.day !== wd) return
      const term = (db.terms || []).find((t) => t.id === sl.term)
      const desde = term?.from || sl.from || db.settings?.termStart || ''
      const hasta = term?.to || sl.until || db.settings?.termEnd || ''
      if ((desde && fecha < desde) || (hasta && fecha > hasta)) return
      out.push({ subject: s, slot: sl, slotIndex: i })
    })
  }
  return out.sort((x, y) => (x.slot.start || '').localeCompare(y.slot.start || ''))
}

/**
 * Avisos con hora fija entre `desde` y `hasta` (milisegundos). Cada uno lleva
 * una `key` estable: así no se manda dos veces lo mismo, y la tablet puede
 * reprogramar sin duplicar.
 */
export function avisosProgramados(db, desde, hasta) {
  const aj = ajustesAvisos(db)
  if (!aj.activos) return []
  const out = []
  const pon = (x) => { if (x.at >= desde && x.at <= hasta) out.push(x) }

  for (const e of db.exams || []) {
    if (!e.date) continue
    const asig = (db.subjects || []).find((s) => s.id === e.subjectId)?.name || ''
    if (e.kind === 'examen') {
      if (!aj.examenes) continue
      pon({ key: `examen3:${e.id}`, at: a(masDias(e.date, -3), '20:00'), title: `Examen en 3 días: ${asig || e.title}`, body: `${e.title}${e.weight ? ` · ${e.weight}% de la nota` : ''}. Buen momento para planificar el repaso.`, url: '#/tareas' })
      pon({ key: `examen1:${e.id}`, at: a(masDias(e.date, -1), '20:00'), title: `Mañana: examen de ${asig || e.title}`, body: `${e.title}${e.start ? ` a las ${e.start}` : ''}${e.room ? ` · ${e.room}` : ''}. Duerme bien esta noche.`, url: '#/tareas' })
    } else {
      if (!aj.entregas || e.delivered) continue
      pon({ key: `entrega1:${e.id}`, at: a(masDias(e.date, -1), '19:00'), title: `Mañana se entrega: ${e.title}`, body: `${asig}${e.weight ? ` · ${e.weight}% de la nota` : ''}${e.start ? ` · hasta las ${e.start}` : ''}`, url: '#/tareas' })
    }
  }

  if (aj.competiciones) {
    for (const c of db.competitions || []) {
      if (!c.date) continue
      const pruebas = (c.results || []).map((r) => r.event).filter(Boolean).join(', ')
      pon({ key: `comp2:${c.id}`, at: a(masDias(c.date, -2), '20:00'), title: `Competición el ${DIAS[diaSemana(c.date)]}: ${c.name || ''}`, body: `${pruebas ? pruebas + '. ' : ''}Hoy y mañana suave, mucha hidratación y a dormir pronto.`, url: '#/atletismo' })
      pon({ key: `comp1:${c.id}`, at: a(masDias(c.date, -1), '20:00'), title: `Mañana compites: ${c.name || ''}`, body: `${c.time ? `A las ${c.time}` : ''}${c.place ? ` en ${c.place}` : ''}. Prepara la bolsa (dorsal, clavos, documentación) y acuéstate pronto.`, url: '#/atletismo' })
    }
  }

  if (aj.eventos) {
    for (const ev of db.events || []) {
      if (!ev.start || !ev.date || ev.repeat?.freq) continue
      pon({ key: `evento:${ev.id}:${ev.date}`, at: a(ev.date, ev.start) - 30 * 60000, title: `En 30 min: ${ev.title}`, body: ev.notes || '', url: '#/calendario' })
    }
  }
  return out.sort((x, y) => x.at - y.at)
}

/** El resumen de la mañana: lo que hay hoy, en dos líneas. `null` si no hay nada que decir. */
export function resumenMatinal(db, fecha, extra = {}) {
  const partes = []
  const clases = clasesDe(db, fecha).filter((c) => !(db.attendance || []).some((x) => x.subjectId === c.subject.id && x.date === fecha && x.slot === c.slotIndex && x.status === 'cancelled'))
  if (clases.length) partes.push(`${clases.length} ${clases.length === 1 ? 'clase' : 'clases'} (la primera, ${clases[0].subject.name} a las ${clases[0].slot.start})`)
  const entregas = (db.exams || []).filter((e) => e.date === fecha && e.kind !== 'examen' && !e.delivered)
  if (entregas.length) partes.push(`entrega: ${entregas.map((e) => e.title).join(', ')}`)
  const examenes = (db.exams || []).filter((e) => e.date === fecha && e.kind === 'examen')
  if (examenes.length) partes.push(`examen: ${examenes.map((e) => e.title).join(', ')}`)
  const comp = (db.competitions || []).filter((c) => c.date === fecha)
  if (comp.length) partes.push(`¡compites! ${comp.map((c) => c.name).join(', ')}`)
  const tareas = (db.tasks || []).filter((t) => t.status !== 'done' && t.due && t.due <= fecha)
  if (tareas.length) partes.push(`${tareas.length} ${tareas.length === 1 ? 'tarea vence' : 'tareas vencen'}`)
  const eventos = (db.events || []).filter((e) => e.date === fecha && !e.repeat?.freq)
  if (eventos.length) partes.push(eventos.map((e) => `${e.start ? e.start + ' ' : ''}${e.title}`).join(', '))
  if (!partes.length && !extra.cuerpo) return null
  return {
    title: comp.length ? 'Hoy compites' : 'Tu día',
    body: [partes.join(' · '), extra.cuerpo].filter(Boolean).join('\n'),
    url: '#/',
  }
}

/**
 * El repaso de la noche: lo que suele quedarse sin apuntar. Solo avisa de lo
 * que de verdad falta.
 */
export function repasoNocturno(db, fecha) {
  const aj = ajustesAvisos(db)
  const falta = []
  if (aj.asistencia) {
    const sin = clasesDe(db, fecha).filter((c) => !(db.attendance || []).some((x) => x.subjectId === c.subject.id && x.date === fecha && x.slot === c.slotIndex))
    if (sin.length) falta.push(`la asistencia de ${sin.length === 1 ? sin[0].subject.name : `${sin.length} clases`}`)
  }
  if (aj.entreno && !(db.training || []).some((t) => t.date === fecha)) {
    // Solo los días que sueles entrenar: un domingo de descanso no necesita aviso.
    const wd = diaSemana(fecha)
    const hace56 = masDias(fecha, -56)
    const dias = new Set((db.training || []).filter((t) => t.done && t.date >= hace56 && t.date < fecha && diaSemana(t.date) === wd).map((t) => t.date))
    if (dias.size >= 3) falta.push('el entreno de hoy (con RPE y, si saltaste, el CMJ)')
  }
  if (aj.diario && diaSemana(fecha) < 5) {
    const usado = (db.workLog || []).some((e) => e.date >= masDias(fecha, -14))
    if (usado && !(db.workLog || []).some((e) => e.date === fecha)) falta.push('dos líneas en el diario de trabajo')
  }
  if (!falta.length) return null
  return { title: 'Antes de dormir', body: `Te falta apuntar ${falta.join(', ')}.`, url: '#/' }
}

export { isoDe, a as horaDe }
