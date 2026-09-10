/**
 * La cola de cambios apuntados sin el ordenador delante.
 *
 * Vive en `localStorage` y no en memoria a propósito: lo normal es apuntar la
 * falta en clase, cerrar la tablet y no volver a abrirla hasta la noche. Si la
 * cola no sobreviviera a cerrar la app, no serviría para nada.
 *
 * No va dentro del `db.json` porque el `db.json` es del ordenador: esto es lo
 * que este aparato tiene pendiente de contarle.
 */
import { claveOp } from '../../server/ops.js'

const KEY = 'prolife.cola'

const leer = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

const escribir = (ops) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(ops))
  } catch {
    /* sin sitio o en modo privado: se pierde la cola, no la app */
  }
}

export const cola = () => leer()
export const enCola = () => leer().length

/**
 * Mete una operación en la cola.
 *
 * Los cambios generales apuntan al mismo sitio una y otra vez mientras se
 * rellena un formulario: cada tecla del nombre de una asignatura es otro «deja
 * esta asignatura así». Como todos dicen cómo tiene que quedar y no cómo
 * cambiarlo, el último hace innecesarios los anteriores y se quitan. Sin esto,
 * una tarde de tablet deja una cola de miles de operaciones que dicen lo mismo.
 *
 * Solo se descartan las que tocan EXACTAMENTE el mismo registro: dos tareas
 * distintas, o un alta y una baja del mismo id, son operaciones distintas y se
 * quedan las dos, en su orden.
 */
export function encolar(op) {
  const clave = claveOp(op)
  const ops = clave ? leer().filter((x) => claveOp(x) !== clave) : leer()
  ops.push(op)
  escribir(ops)
  return ops.length
}

/**
 * Quita de la cola las operaciones que ya se han mandado, por su id, en vez de
 * vaciarla entera: entre que se manda y que contesta, puedes haber apuntado
 * otra cosa, y esa no se ha enviado todavía.
 */
export function quitar(ids) {
  const fuera = new Set(ids)
  escribir(leer().filter((op) => !fuera.has(op.id)))
}

export const vaciarCola = () => escribir([])

/* ------------------------------------------------------- lo ya entregado --- */

/**
 * Lo que ya está en el buzón de Drive pero el ordenador todavía no ha recogido.
 *
 * Hace falta por una razón que solo se ve al usarlo: el `db.json` de Drive lo
 * escribe SOLO el ordenador, así que hasta que no abra la app allí, lo que
 * apuntaste en la tablet no está en el fichero. Sin esto, cerrar y volver a
 * abrir la app en la tablet enseñaría la base sin tus cambios —la asignatura
 * que creaste en clase habría desaparecido— aunque estén guardados y a salvo.
 * Con esto se vuelven a aplicar encima de lo que llega de Drive, y lo que ves
 * es lo que hay.
 *
 * Se sueltan cuando el `db.json` de Drive es más nuevo que el lote: eso
 * significa que el ordenador ha pasado por ahí y ya los lleva dentro.
 */
const KEY_BUZON = 'prolife.buzon'

const leerBuzon = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY_BUZON) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

const escribirBuzon = (lotes) => {
  try {
    localStorage.setItem(KEY_BUZON, JSON.stringify(lotes))
  } catch {
    /* sin sitio: se pierde el reflejo local, no lo entregado */
  }
}

export function guardarEnBuzon(ops) {
  if (!ops?.length) return
  escribirBuzon([...leerBuzon(), { at: Date.now(), ops }].slice(-200))
}

/** Las operaciones entregadas que el ordenador todavía no ha recogido. */
export function enBuzon(stamp = 0) {
  return leerBuzon().filter((l) => l.at > stamp).flatMap((l) => l.ops)
}

/** Suelta los lotes que el ordenador ya ha aplicado, según la fecha del db.json. */
export function podarBuzon(stamp = 0) {
  const vivos = leerBuzon().filter((l) => l.at > stamp)
  escribirBuzon(vivos)
  return vivos.length
}
