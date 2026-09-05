/**
 * Cambios sueltos que la tablet puede apuntar sin el ordenador delante.
 *
 * Por qué existe esto. Guardar en prolife manda el `db.json` ENTERO, así que
 * escribir desde una copia de hace tres horas machacaría lo que hayas hecho en
 * el ordenador mientras tanto. Por eso sin conexión la app no dejaba escribir
 * nada: era eso o perder trabajo.
 *
 * Una operación no es una copia de la base: es «marca esta clase», «tacha esta
 * tarea», «apunta el entreno del martes». Se guarda en una cola y, cuando el
 * ordenador vuelve, se aplica sobre el `db.json` DE ESE MOMENTO. Lo que hiciste
 * en el ordenador entretanto sigue ahí: solo cambia lo que dice la operación.
 *
 * Las tres tocan un registro concreto y son idempotentes —aplicarlas dos veces
 * deja lo mismo—, así que reintentar tras un corte no puede duplicar nada.
 *
 * Este fichero lo usan los dos lados: la tablet para pintar el cambio al
 * momento, y el servidor para aplicarlo de verdad. Es el mismo código a
 * propósito: dos versiones de la misma regla acabarían discrepando.
 *
 * Vive en `server/` y no en `src/lib/` porque el instalador solo empaqueta
 * `dist`, `electron` y `server`: desde `src/` el servidor no podría importarlo
 * en la app instalada. La interfaz sí puede tirar de aquí, que Vite lo mete en
 * el paquete al compilar.
 */

export const KINDS = ['asistencia', 'tarea', 'entreno']

const texto = (v) => (typeof v === 'string' ? v : null)

/**
 * ¿Tiene forma de operación? Se valida en el servidor porque lo que llega de la
 * red no es de fiar, aunque venga con la clave.
 */
export function opError(op) {
  if (!op || typeof op !== 'object') return 'no es una operación'
  if (!KINDS.includes(op.kind)) return `operación desconocida: ${op.kind}`
  if (op.kind === 'asistencia') {
    if (!texto(op.subjectId) || !texto(op.date) || !Number.isInteger(op.slot)) return 'asistencia incompleta'
    if (op.status != null && !texto(op.status)) return 'estado de asistencia no válido'
  }
  if (op.kind === 'tarea') {
    if (!texto(op.taskId) || !texto(op.status)) return 'tarea incompleta'
  }
  if (op.kind === 'entreno') {
    if (!op.training || typeof op.training !== 'object') return 'entreno incompleto'
    if (!texto(op.training.id) || !texto(op.training.date)) return 'el entreno necesita id y fecha'
  }
  return null
}

/** Id estable de una asistencia: el mismo que usa la pantalla de la asignatura. */
const asistenciaId = (op) => `${op.subjectId}-${op.date}-${op.slot}`

/**
 * Aplica una operación sobre una base de datos, mutándola.
 *
 * Devuelve `null` si ha entrado, o el motivo por el que no. No lanza: una
 * operación que ya no vale —la tarea que borraste desde el ordenador— no puede
 * tumbar el resto de la cola.
 */
export function applyOp(db, op) {
  const mal = opError(op)
  if (mal) return mal

  if (op.kind === 'asistencia') {
    if (!db.subjects.some((s) => s.id === op.subjectId)) return 'la asignatura ya no existe'
    const i = db.attendance.findIndex(
      (a) => a.subjectId === op.subjectId && a.date === op.date && a.slot === op.slot
    )
    if (op.status == null) {
      if (i >= 0) db.attendance.splice(i, 1)
      return null
    }
    if (i >= 0) db.attendance[i].status = op.status
    else db.attendance.push({ id: asistenciaId(op), subjectId: op.subjectId, date: op.date, slot: op.slot, status: op.status })
    return null
  }

  if (op.kind === 'tarea') {
    const t = db.tasks.find((x) => x.id === op.taskId)
    if (!t) return 'la tarea ya no existe'
    t.status = op.status
    // `doneAt` viaja dentro de la operación para que aplicarla dos veces no
    // mueva la hora de completado.
    t.doneAt = op.status === 'done' ? op.doneAt || Date.now() : null
    return null
  }

  if (op.kind === 'entreno') {
    const t = op.training
    if (!Array.isArray(db.training)) db.training = []
    // La pantalla de Atletismo es de un entreno por día, así que se busca por
    // id o por fecha: si el ordenador ya tenía uno de ese día, manda este.
    const i = db.training.findIndex((x) => x.id === t.id || x.date === t.date)
    if (i >= 0) db.training[i] = { ...db.training[i], ...t }
    else db.training.push(t)

    // El entreno también cuenta como tiempo, igual que al guardarlo desde el
    // ordenador: el tramo va atado al id del entreno, así que no se duplica.
    const sid = 'sess_' + t.id
    const si = db.sessions.findIndex((s) => s.id === sid)
    if (t.done && Number(t.minutes) > 0) {
      const row = {
        id: sid, area: 'sport', refId: null, taskId: null, label: t.type,
        date: t.date, start: op.at || Date.now(), end: op.at || Date.now(),
        seconds: Number(t.minutes) * 60, source: 'manual',
      }
      if (si >= 0) db.sessions[si] = row
      else db.sessions.push(row)
    } else if (si >= 0) {
      db.sessions.splice(si, 1)
    }
    return null
  }

  return `operación desconocida: ${op.kind}`
}

/** Cómo se le cuenta al usuario lo que tiene esperando en la cola. */
export function describeOp(op) {
  if (op.kind === 'asistencia') return op.status ? `Asistencia del ${op.date}` : `Asistencia del ${op.date} (sin marcar)`
  if (op.kind === 'tarea') return op.status === 'done' ? 'Tarea completada' : 'Tarea reabierta'
  if (op.kind === 'entreno') return `Entreno del ${op.training?.date}`
  return 'Cambio'
}
