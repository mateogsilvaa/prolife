import React, { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { api } from '../lib/api.js'

/**
 * Una foto guardada en tu carpeta, venga de donde venga.
 *
 * Contra el servidor del ordenador la dirección de un archivo es inmediata y se
 * podría poner directamente en el `src`. Contra Google Drive no: hay que
 * traerse los bytes y envolverlos en un `blob:`. Como el resto de la app no
 * tiene por qué saber en cuál de los dos está, se pide siempre por `rawUrl`,
 * que es una promesa en los dos casos.
 *
 * La URL de un blob ocupa memoria hasta que se suelta, así que se suelta al
 * desmontar. Y si la foto ya no está —la borraste desde el explorador—, se
 * enseña un hueco en vez de dejar el icono roto del navegador.
 */
export default function Foto({ ruta, alto = 92, onClick }) {
  const [url, setUrl] = useState(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    let vivo = true
    let creada = null
    setFallo(false)
    setUrl(null)

    api.rawUrl(ruta).then(
      (u) => {
        if (!vivo) {
          if (u?.startsWith('blob:')) URL.revokeObjectURL(u)
          return
        }
        if (u?.startsWith('blob:')) creada = u
        setUrl(u)
      },
      () => vivo && setFallo(true)
    )

    return () => {
      vivo = false
      if (creada) URL.revokeObjectURL(creada)
    }
  }, [ruta])

  const marco = {
    height: alto, width: alto, flexShrink: 0, borderRadius: 'var(--r)',
    border: '1px solid var(--line)', overflow: 'hidden', background: 'var(--surface-2)',
    display: 'grid', placeItems: 'center',
  }

  if (fallo) {
    return (
      <div style={marco} title={`No se encuentra ${ruta}`}>
        <Icon name="x" size={14} />
      </div>
    )
  }

  return (
    <div style={{ ...marco, cursor: onClick ? 'zoom-in' : 'default' }} onClick={onClick} title={ruta.split('/').pop()}>
      {url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span className="dim" style={{ fontSize: 10 }}>…</span>}
    </div>
  )
}
