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

export function encolar(op) {
  const ops = leer()
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
