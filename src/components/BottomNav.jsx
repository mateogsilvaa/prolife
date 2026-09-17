import React, { useState } from 'react'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import { useStore } from '../lib/store.jsx'
import { daysUntil } from '../lib/date.js'

/**
 * La navegación cuando la pantalla es un móvil.
 *
 * En un teléfono la columna lateral es la peor solución posible: o se come
 * medio ancho, o se encoge a una tira de iconos sin nombre que hay que
 * adivinar, y en los dos casos queda arriba del todo, que es justo donde el
 * pulgar no llega. Abajo y con cinco sitios es lo que hace todo el mundo
 * porque funciona.
 *
 * Cinco y no diez: cabe el nombre, el dedo acierta, y lo que no cabe está a un
 * toque en «Más». Elegir cuáles son los cinco es la única decisión de verdad
 * aquí, y se decide por lo que se abre a diario de pie: el día, lo que hay que
 * hacer, cuándo es cada cosa y la carrera.
 */
const FIJOS = [
  { to: '#/', icon: 'home', label: 'Hoy' },
  { to: '#/tareas', icon: 'check', label: 'Tareas', count: 'tasks' },
  { to: '#/calendario', icon: 'calendar', label: 'Agenda' },
  { to: '#/uni', icon: 'grad', label: 'Uni' },
]

const RESTO = [
  { to: '#/trabajo', icon: 'briefcase', label: 'Trabajo' },
  { to: '#/atletismo', icon: 'dumbbell', label: 'Atletismo' },
  { to: '#/voluntariado', icon: 'heart', label: 'Voluntariado' },
  { to: '#/estadisticas', icon: 'chart', label: 'Estadísticas' },
  { to: '#/archivos', icon: 'folder', label: 'Archivos' },
  { to: '#/ajustes', icon: 'settings', label: 'Ajustes' },
]

export default function BottomNav({ route }) {
  const { db, update } = useStore()
  const [mas, setMas] = useState(false)

  const vencidas = db.tasks.filter((t) => t.status !== 'done' && t.due && daysUntil(t.due) <= 0).length
  const activo = (to) => (to === '#/' ? route.path === '/' : route.path.startsWith(to.slice(1)))
  // «Más» se enciende cuando estás en una de las suyas: si no, en Ajustes no
  // hay nada marcado y la barra parece que se ha perdido.
  const enResto = RESTO.some((r) => activo(r.to))

  return (
    <>
      <nav className="tabbar">
        {FIJOS.map((it) => (
          <a key={it.to} href={it.to} className={`tabbar-item${activo(it.to) ? ' on' : ''}`}>
            <span className="tabbar-icono">
              <Icon name={it.icon} size={19} />
              {it.count === 'tasks' && vencidas > 0 && <span className="tabbar-punto" />}
            </span>
            <span>{it.label}</span>
          </a>
        ))}
        <button className={`tabbar-item${enResto ? ' on' : ''}`} onClick={() => setMas(true)}>
          <span className="tabbar-icono"><Icon name="layers" size={19} /></span>
          <span>Más</span>
        </button>
      </nav>

      {mas && (
        <Modal title="Ir a" onClose={() => setMas(false)}>
          <div className="stack" style={{ gap: 4 }}>
            {RESTO.map((it) => (
              <a key={it.to} href={it.to} className="link-tile" onClick={() => setMas(false)}>
                <span className="glyph" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                  <Icon name={it.icon} size={12} />
                </span>
                <span style={{ fontSize: 13.5 }}>{it.label}</span>
              </a>
            ))}
            <button
              className="link-tile"
              onClick={() => {
                update((d) => { d.settings.theme = d.settings.theme === 'ink' ? 'paper' : 'ink' })
                setMas(false)
              }}
            >
              <span className="glyph" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                <Icon name={db.settings.theme === 'ink' ? 'sun' : 'moon'} size={12} />
              </span>
              <span style={{ fontSize: 13.5 }}>{db.settings.theme === 'ink' ? 'Modo papel' : 'Modo tinta'}</span>
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
