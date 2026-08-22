import React, { useEffect, useRef, useState } from 'react'
import Modal from './Modal.jsx'

/**
 * Pedir un nombre o una confirmación sin `prompt()` ni `confirm()`.
 *
 * Electron no implementa `window.prompt()`: lanza, así que cualquier botón que
 * dependiera de él (nueva nota, nueva carpeta, renombrar) fallaba en silencio
 * dentro de la app de escritorio aunque funcionase en el navegador.
 *
 * Con `label` pide un texto; sin él, solo confirma.
 */
export default function Ask({
  title,
  label,
  message,
  value = '',
  placeholder,
  okText = 'Aceptar',
  danger,
  onOk,
  onCancel,
}) {
  const isPrompt = label != null
  const [v, setV] = useState(value)
  const input = useRef(null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const accept = () => {
    if (isPrompt) {
      const clean = v.trim()
      if (!clean) return
      onOk(clean)
    } else {
      onOk(true)
    }
  }

  return (
    <Modal
      title={title}
      onClose={onCancel}
      foot={
        <>
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          <div className="spacer" />
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={accept}>{okText}</button>
        </>
      }
    >
      <div className="stack">
        {message && <p style={{ margin: 0, maxWidth: '44ch' }}>{message}</p>}
        {isPrompt && (
          <div className="field">
            <label>{label}</label>
            <input
              ref={input}
              className="input"
              value={v}
              placeholder={placeholder}
              onChange={(e) => setV(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); accept() }
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  )
}
