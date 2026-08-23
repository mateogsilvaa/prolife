/**
 * Arrastres que funcionan igual con ratón y con el dedo.
 *
 * Los separadores de paneles se escribieron con `mousedown`/`mousemove`, que en
 * una pantalla táctil no llegan: el navegador manda eventos de toque y, como
 * nadie los escucha, en vez de mover el separador se pone a desplazar la
 * página. Los eventos de puntero cubren ratón, dedo y lápiz con un solo camino.
 *
 * `setPointerCapture` es lo que evita perder el arrastre en cuanto el dedo se
 * sale del separador, que con 5 px de ancho es en el primer milímetro.
 */
export function startDrag(e, onMove, onEnd) {
  e.preventDefault()
  const target = e.currentTarget
  const id = e.pointerId

  try {
    target.setPointerCapture?.(id)
  } catch {
    /* sin captura el arrastre sigue valiendo, solo es menos tolerante */
  }

  const move = (ev) => onMove(ev)
  const end = (ev) => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', end)
    target.removeEventListener('pointercancel', end)
    try {
      target.releasePointerCapture?.(id)
    } catch {
      /* ya liberado */
    }
    onEnd?.(ev)
  }

  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', end)
  target.addEventListener('pointercancel', end)
}
