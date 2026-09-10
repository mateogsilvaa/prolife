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
 *
 * Desde que la tablet puede hablar con Google Drive por su cuenta, esto es
 * además el ÚNICO camino por el que la tablet toca la base de datos: deja las
 * operaciones como ficheros sueltos en `.prolife/ops/` y el ordenador las
 * vacía ahí (`drenarOps`, en db.js). Así sigue habiendo un solo escritor del
 * `db.json` —el ordenador— y dos aparatos no pueden pisarse el fichero entero.
 */

export const KINDS = ['asistencia', 'tarea', 'entreno', 'tarea-nueva', 'evento', 'sesion', 'voluntariado', 'cambio']

/**
 * Las siete de arriba son operaciones con nombre propio, escritas a mano una a
 * una. Servían mientras la tablet solo tenía que marcar faltas y tachar tareas,
 * pero no escalan: cada cosa nueva que se puede hacer en el ordenador exigía
 * inventar aquí otra operación, y mientras tanto la tablet contestaba «esto
 * hazlo en el ordenador». Una tablet que no deja hacer lo mismo no sirve.
 *
 * `cambio` es la general y no hay que ampliarla nunca: en vez de describir la
 * intención («marca esta clase»), describe el efecto («en la lista `tasks`, deja
 * este registro así»). La tablet aplica el cambio sobre su copia, mira qué ha
 * quedado distinto y manda eso. Sigue sin mandar la base entera —que es lo que
 * machacaría el trabajo del ordenador—: manda solo los registros tocados.
 *
 *   { op: 'fijar',  ruta: ['settings', 'attendanceMin'], valor: 0.8 }
 *   { op: 'poner',  ruta: ['tasks'], valor: { id: 't1', … } }   ← alta o edición
 *   { op: 'quitar', ruta: ['tasks'], ref: 't1' }
 *
 * Las tres son idempotentes: dicen cómo tiene que quedar algo, no cómo cambiarlo
 * desde donde estaba, así que aplicarlas dos veces deja lo mismo.
 *
 * Lo que NO puede hacer, y es a propósito: dos aparatos que tocan el MISMO
 * registro entre sincronizaciones se pisan, y gana el último. Lo que no se pisa
 * —que es lo que importa— son dos registros distintos: la tarea que creaste en
 * clase y la que creó el ordenador conviven, porque cada `poner` va por su id.
 */
const OPS_CAMBIO = ['fijar', 'poner', 'quitar']

/** Claves que una operación no puede tocar, venga de donde venga. */
const PROHIBIDAS = new Set(['__proto__', 'constructor', 'prototype', 'version'])

const rutaMala = (ruta) => {
  if (!Array.isArray(ruta) || !ruta.length || ruta.length > 6) return 'la ruta del cambio no vale'
  for (const k of ruta) {
    if (typeof k !== 'string' || !k) return 'la ruta del cambio no vale'
    // `version` la pone la migración y `_stamp` el servidor: ni una ni otra son
    // de nadie más, y dejarlas pasar sería dejar mentir sobre el formato.
    if (PROHIBIDAS.has(k) || k.startsWith('_')) return `«${k}» no se puede cambiar así`
  }
  return null
}

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
  if (op.kind === 'tarea-nueva') {
    if (!op.task || typeof op.task !== 'object') return 'tarea incompleta'
    if (!texto(op.task.id) || !texto(op.task.title)) return 'la tarea necesita id y título'
  }
  if (op.kind === 'evento') {
    if (!op.event || typeof op.event !== 'object') return 'evento incompleto'
    if (!texto(op.event.id) || !texto(op.event.title) || !texto(op.event.date)) return 'el evento necesita id, título y fecha'
  }
  if (op.kind === 'sesion') {
    if (!op.session || typeof op.session !== 'object') return 'tramo incompleto'
    if (!texto(op.session.id) || !texto(op.session.date)) return 'el tramo necesita id y fecha'
    if (!Number.isFinite(Number(op.session.seconds))) return 'el tramo necesita duración'
  }
  if (op.kind === 'cambio') {
    if (!OPS_CAMBIO.includes(op.op)) return `cambio desconocido: ${op.op}`
    const mala = rutaMala(op.ruta)
    if (mala) return mala
    if (op.op === 'poner' && (!op.valor || typeof op.valor !== 'object' || !texto(op.valor.id))) {
      return 'un registro nuevo necesita id'
    }
    // `ref` y no `id`: cada operación lleva ya su propio `id`, que es el de la
    // operación en la cola. Llamar igual a las dos cosas hacía que al encolarla
    // se machacara el registro que había que quitar y no se quitara nada.
    if (op.op === 'quitar' && !texto(op.ref)) return 'no dice qué registro quitar'
  }
  if (op.kind === 'voluntariado') {
    if (!op.day || typeof op.day !== 'object') return 'jornada incompleta'
    if (!texto(op.day.id) || !texto(op.day.date)) return 'la jornada necesita id y fecha'
    if (!texto(op.day.volunteerId)) return 'la jornada necesita saber de qué entidad es'
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

  // Las tres que siguen crean algo que en la tablet todavía no existía en el
  // ordenador. Todas se identifican por su `id`, que lo pone quien la crea, así
  // que aplicarlas dos veces actualiza en vez de duplicar.

  if (op.kind === 'tarea-nueva') {
    const i = db.tasks.findIndex((t) => t.id === op.task.id)
    if (i >= 0) db.tasks[i] = { ...db.tasks[i], ...op.task }
    else db.tasks.unshift(op.task)
    return null
  }

  if (op.kind === 'evento') {
    if (!Array.isArray(db.events)) db.events = []
    const i = db.events.findIndex((e) => e.id === op.event.id)
    if (i >= 0) db.events[i] = { ...db.events[i], ...op.event }
    else db.events.push(op.event)
    return null
  }

  if (op.kind === 'sesion') {
    const i = db.sessions.findIndex((s) => s.id === op.session.id)
    if (i >= 0) db.sessions[i] = { ...db.sessions[i], ...op.session }
    else db.sessions.push(op.session)
    return null
  }

  if (op.kind === 'voluntariado') {
    const d = op.day
    if (!Array.isArray(db.volunteerDays)) db.volunteerDays = []
    if (!(db.volunteering || []).some((v) => v.id === d.volunteerId)) return 'esa entidad de voluntariado ya no existe'
    const i = db.volunteerDays.findIndex((x) => x.id === d.id)
    if (i >= 0) db.volunteerDays[i] = { ...db.volunteerDays[i], ...d }
    else db.volunteerDays.push(d)

    // Igual que el entreno: la jornada también cuenta como tiempo, con el tramo
    // atado a su id para que apuntarla dos veces no sume dos veces.
    const sid = 'vol_' + d.id
    const si = db.sessions.findIndex((s) => s.id === sid)
    if (Number(d.minutes) > 0) {
      const row = {
        id: sid, area: 'volunteer', refId: d.volunteerId, taskId: null, label: d.task || 'Voluntariado',
        date: d.date, start: op.at || Date.now(), end: op.at || Date.now(),
        seconds: Number(d.minutes) * 60, source: 'manual',
      }
      if (si >= 0) db.sessions[si] = row
      else db.sessions.push(row)
    } else if (si >= 0) {
      db.sessions.splice(si, 1)
    }
    return null
  }

  if (op.kind === 'cambio') return aplicarCambio(db, op)

  return `operación desconocida: ${op.kind}`
}

/* ------------------------------------------------------- el cambio general -- */

/**
 * Baja por la ruta hasta el contenedor, creando por el camino lo que falte.
 *
 * Crear lo que falta importa: el ordenador puede tener una base sin
 * `settings.assistant` todavía, y un cambio que venga de la tablet no tiene por
 * qué morirse por eso.
 */
function contenedor(db, ruta, crear) {
  let n = db
  for (const k of ruta) {
    if (n == null || typeof n !== 'object') return null
    if (n[k] == null) {
      if (!crear) return null
      n[k] = {}
    }
    n = n[k]
  }
  return n
}

function aplicarCambio(db, op) {
  if (op.op === 'fijar') {
    const clave = op.ruta[op.ruta.length - 1]
    const padre = contenedor(db, op.ruta.slice(0, -1), true)
    if (!padre || typeof padre !== 'object') return 'no existe donde poner ese valor'
    if (op.valor === undefined) delete padre[clave]
    else padre[clave] = op.valor
    return null
  }

  const clave = op.ruta[op.ruta.length - 1]
  const padre = contenedor(db, op.ruta.slice(0, -1), op.op === 'poner')
  if (!padre || typeof padre !== 'object') return 'no existe esa lista'
  // Una lista que todavía no está se crea al dar de alta el primero: es lo que
  // pasa con `volunteering` en una base que viene de antes de que existiera.
  if (!Array.isArray(padre[clave])) {
    if (op.op !== 'poner') return 'no existe esa lista'
    padre[clave] = []
  }
  const lista = padre[clave]

  if (op.op === 'quitar') {
    const i = lista.findIndex((x) => x && x.id === op.ref)
    // Que ya no esté no es un fallo: es el resultado que pedía la operación.
    if (i >= 0) lista.splice(i, 1)
    return null
  }

  const i = lista.findIndex((x) => x && x.id === op.valor.id)
  // Se reemplaza entero y no se fusiona: el registro que manda la tablet ES el
  // estado que tiene que quedar, y fusionar dejaría vivos campos que allí se
  // habían quitado a propósito.
  if (i >= 0) lista[i] = op.valor
  else lista.push(op.valor)
  return null
}

/* ------------------------------------------------ de dos bases a cambios --- */

const esRegistro = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.id === 'string'
const esListaDeRegistros = (v) => Array.isArray(v) && v.every(esRegistro)
const esObjeto = (v) => v && typeof v === 'object' && !Array.isArray(v)

/** Igualdad por valor. Se compara a mano porque el orden de las claves baila. */
export function igual(a, b) {
  if (a === b) return true
  if (a == null || b == null || typeof a !== typeof b) return false
  if (typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => igual(x, b[i]))
  const ka = Object.keys(a), kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => igual(a[k], b[k]))
}

/**
 * Qué ha cambiado entre dos bases, en forma de operaciones.
 *
 * Esta es la pieza que hace que la tablet pueda hacer lo mismo que el
 * ordenador. La app entera escribe mutando un borrador de la base; aquí se
 * mira ese borrador contra el original y sale la lista de cambios que hay que
 * contarle al ordenador. No hay que enseñarle nada de cada pantalla nueva:
 * mientras el cambio quede en la base, sale solo.
 *
 * Las listas de registros se comparan **por id**, no por posición, que es lo
 * que permite convivir con el ordenador: mover una tarea de sitio no manda
 * nada, y añadir una manda solo esa.
 */
export function diffDb(antes, despues, ruta = []) {
  const ops = []
  if (ruta.length >= 4) return ops
  const claves = new Set([...Object.keys(antes || {}), ...Object.keys(despues || {})])

  for (const k of claves) {
    if (PROHIBIDAS.has(k) || k.startsWith('_')) continue
    const a = antes?.[k]
    const b = despues?.[k]
    if (igual(a, b)) continue

    // Una lista que en el original no estaba se manda registro a registro
    // igualmente: mandarla entera de una pieza borraría lo que el ordenador
    // hubiera metido ahí mientras tanto.
    if (esListaDeRegistros(b) && (a == null || esListaDeRegistros(a))) {
      const antesPorId = new Map((a || []).map((x) => [x.id, x]))
      const despuesPorId = new Map(b.map((x) => [x.id, x]))
      for (const [id, x] of despuesPorId) {
        if (!igual(antesPorId.get(id), x)) ops.push({ kind: 'cambio', op: 'poner', ruta: [...ruta, k], valor: x })
      }
      for (const id of antesPorId.keys()) {
        if (!despuesPorId.has(id)) ops.push({ kind: 'cambio', op: 'quitar', ruta: [...ruta, k], ref: id })
      }
      continue
    }

    // Objetos sueltos —`settings`, `profile`— se bajan un nivel más para no
    // mandar el bloque entero: cambiar el tema no puede deshacer el mínimo de
    // asistencia que tocaste en el ordenador hace un rato.
    if (esObjeto(a) && esObjeto(b)) {
      ops.push(...diffDb(a, b, [...ruta, k]))
      continue
    }

    ops.push({ kind: 'cambio', op: 'fijar', ruta: [...ruta, k], valor: b })
  }
  return ops
}

/**
 * Qué registro toca una operación, para no acumular en la cola diez versiones
 * del mismo mientras se rellena un formulario. La última manda: todas dicen
 * cómo tiene que quedar, no cómo llegar hasta ahí.
 */
export function claveOp(op) {
  if (!op || op.kind !== 'cambio') return null
  const donde = op.ruta.join('/')
  if (op.op === 'fijar') return `fijar:${donde}`
  if (op.op === 'poner') return `poner:${donde}:${op.valor?.id}`
  return `quitar:${donde}:${op.ref}`
}

/** Cómo se le cuenta al usuario lo que tiene esperando en la cola. */
export function describeOp(op) {
  if (op.kind === 'asistencia') return op.status ? `Asistencia del ${op.date}` : `Asistencia del ${op.date} (sin marcar)`
  if (op.kind === 'tarea') return op.status === 'done' ? 'Tarea completada' : 'Tarea reabierta'
  if (op.kind === 'entreno') return `Entreno del ${op.training?.date}`
  if (op.kind === 'tarea-nueva') return `Tarea nueva: ${op.task?.title}`
  if (op.kind === 'evento') return `Evento: ${op.event?.title}`
  if (op.kind === 'sesion') return `Tiempo apuntado el ${op.session?.date}`
  if (op.kind === 'voluntariado') return `Jornada de voluntariado del ${op.day?.date}`
  if (op.kind === 'cambio') return describeCambio(op)
  return 'Cambio'
}

/** Nombres en cristiano de las listas de la base, para los avisos. */
const NOMBRES = {
  subjects: ['Asignatura', 'la asignatura'],
  projects: ['Proyecto', 'el proyecto'],
  tasks: ['Tarea', 'la tarea'],
  exams: ['Examen', 'el examen'],
  events: ['Evento', 'el evento'],
  sessions: ['Tiempo', 'el tramo de tiempo'],
  training: ['Entreno', 'el entreno'],
  attendance: ['Asistencia', 'la asistencia'],
  categories: ['Categoría', 'la categoría'],
  volunteering: ['Voluntariado', 'la entidad'],
  volunteerDays: ['Voluntariado', 'la jornada'],
  settings: ['Ajustes', 'los ajustes'],
  profile: ['Perfil', 'el perfil'],
  workspaces: ['Escritorio', 'la disposición'],
}

function describeCambio(op) {
  const lista = op.ruta[op.op === 'fijar' ? 0 : op.ruta.length - 1]
  const [titulo, articulo] = NOMBRES[lista] || ['Cambio', 'esto']
  if (op.op === 'quitar') return `${titulo} eliminada`
  if (op.op === 'fijar') return `${titulo}: ${op.ruta.slice(1).join(' · ')}`
  const nombre = op.valor?.name || op.valor?.title || op.valor?.date
  return nombre ? `${titulo}: ${nombre}` : `Cambio en ${articulo}`
}
