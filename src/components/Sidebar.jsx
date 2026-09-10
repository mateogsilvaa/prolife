import React, { useState } from 'react'
import Icon from './Icon.jsx'
import { enDrive } from '../lib/api.js'
import Modal from './Modal.jsx'
import Launcher from './Launcher.jsx'
import Brand from './Brand.jsx'
import { useStore } from '../lib/store.jsx'
import { today, daysUntil, iso, startOfWeek, addDays } from '../lib/date.js'

const NAV = [
  { g: 'Día a día', items: [
    { to: '#/', icon: 'home', label: 'Hoy' },
    { to: '#/tareas', icon: 'check', label: 'Tareas', count: 'tasks' },
    { to: '#/calendario', icon: 'calendar', label: 'Calendario' },
  ]},
  { g: 'Áreas', items: [
    { to: '#/uni', icon: 'grad', label: 'Universidad', count: 'subjects' },
    { to: '#/trabajo', icon: 'briefcase', label: 'Trabajo' },
    { to: '#/atletismo', icon: 'dumbbell', label: 'Atletismo', count: 'training' },
    { to: '#/voluntariado', icon: 'heart', label: 'Voluntariado' },
  ]},
  { g: 'Registro', items: [
    { to: '#/estadisticas', icon: 'chart', label: 'Estadísticas' },
    { to: '#/archivos', icon: 'folder', label: 'Archivos' },
    { to: '#/ajustes', icon: 'settings', label: 'Ajustes' },
  ]},
]

export default function Sidebar({ route, onAI, dockOpen }) {
  const { db, update } = useStore()
  const [links, setLinks] = useState(false)

  const weekStart = iso(startOfWeek(new Date()))
  const counts = {
    tasks: db.tasks.filter((t) => t.status !== 'done' && t.due && daysUntil(t.due) <= 0).length,
    subjects: db.subjects.length,
    training: db.training.filter((t) => t.done && t.date >= weekStart).length,
  }
  const dark = db.settings.theme === 'ink'

  // los espacios de trabajo se marcan bajo su área
  const areaOf = { espacio: { uni: '#/uni', trabajo: '#/trabajo', tarea: '#/tareas' } }
  const parts = route.parts
  const effective = parts[0] === 'espacio' ? areaOf.espacio[parts[1]] || route.path : null

  return (
    <aside className="sidebar">
      <Brand subtitle={db.profile?.course || ''} />

      <nav className="nav">
        {NAV.map((g) => (
          <div className="nav-group" key={g.g}>
            <div className="eyebrow">{g.g}</div>
            {g.items.map((it) => {
              const active = effective
                ? effective === it.to
                : it.to === '#/' ? route.path === '/' : route.path.startsWith(it.to.slice(1))
              const n = counts[it.count]
              return (
                <a key={it.to} href={it.to} className={`nav-item${active ? ' active' : ''}`}>
                  <Icon name={it.icon} size={15} />
                  <span className="label">{it.label}</span>
                  {n > 0 && <span className={`badge${it.count === 'tasks' ? ' hot' : ''}`}>{n}</span>}
                </a>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        {/* Sin ordenador no hay Ollama a quien preguntar. */}
        {!enDrive && (
          <button className={`nav-item${dockOpen ? ' active' : ''}`} onClick={onAI}>
            <Icon name="sparkle" size={15} />
            <span className="label">Ayudante</span>
            <span className="kbd">Ctrl I</span>
          </button>
        )}
        <button className="nav-item" onClick={() => setLinks(true)}>
          <Icon name="link" size={15} />
          <span className="label">Enlaces</span>
          <span className="kbd">Ctrl K</span>
        </button>
        <button className="nav-item" onClick={() => update((d) => { d.settings.theme = dark ? 'paper' : 'ink' })}>
          <Icon name={dark ? 'sun' : 'moon'} size={15} />
          <span className="label">{dark ? 'Modo papel' : 'Modo tinta'}</span>
        </button>
      </div>

      {links && (
        <Modal title="Accesos rápidos" onClose={() => setLinks(false)}>
          <Launcher onOpenDock={() => { setLinks(false); onAI() }} />
        </Modal>
      )}
    </aside>
  )
}
