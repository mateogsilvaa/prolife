import React, { useEffect } from 'react'
import Icon from './Icon.jsx'

export default function Modal({ title, subtitle, onClose, children, foot, wide, tight, head }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ minWidth: 0 }}>
            <h3 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h3>
            {subtitle && <div className="dim mono" style={{ fontSize: 11 }}>{subtitle}</div>}
          </div>
          <div className="spacer" />
          {head}
          <button className="btn ghost icon" onClick={onClose} title="Cerrar (Esc)">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className={`modal-body${tight ? ' tight' : ''}`}>{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  )
}
