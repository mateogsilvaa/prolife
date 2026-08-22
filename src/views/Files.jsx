import React, { useState } from 'react'
import Icon from '../components/Icon.jsx'
import Workspace from '../components/Workspace.jsx'
import { useStore } from '../lib/store.jsx'
import { api } from '../lib/api.js'

/**
 * Explorador global: el mismo espacio de trabajo, pero apuntando a cualquier
 * carpeta del directorio en vez de a una asignatura concreta. Aquí no se mide
 * tiempo, porque rebuscar entre carpetas no es trabajar en nada en particular.
 */
export default function Files() {
  const { db, config } = useStore()
  const [root, setRoot] = useState('')

  const shortcuts = [
    { p: '', label: 'Todo' },
    { p: 'Universidad', label: 'Universidad' },
    { p: 'Trabajo', label: 'Trabajo' },
    { p: 'Tareas', label: 'Tareas' },
    { p: 'Personal', label: 'Personal' },
  ]

  return (
    <div className="ws-shell">
      <header className="ws-head">
        <Icon name="folder" size={15} />
        <h2>Archivos</h2>
        <span className="mono dim" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>{config?.baseDir}</span>
        <div className="spacer" />
        <div className="row wrap" style={{ gap: 4, justifyContent: 'flex-end' }}>
          {shortcuts.map((s) => (
            <button key={s.p} className={`chip${root === s.p ? ' on' : ''}`} onClick={() => setRoot(s.p)}>{s.label}</button>
          ))}
          {db.subjects.map((s) => (
            <button key={s.id} className={`chip${root === s.folder ? ' on' : ''}`} onClick={() => setRoot(s.folder)}>
              <span className="dot" style={{ background: s.color }} /> {s.name}
            </button>
          ))}
        </div>
        <button className="btn sm ghost" onClick={() => api.openPath(root)} title="Abrir en el explorador">
          <Icon name="external" size={12} />
        </button>
      </header>
      <Workspace key={root} root={root} />
    </div>
  )
}
