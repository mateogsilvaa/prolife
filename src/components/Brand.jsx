import React, { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

/** Donde vive el logo: dentro de tu directorio, así que viaja con la nube. */
export const LOGO_PATH = '.prolife/logo.png'

/**
 * La marca de la app. Si has dejado un `logo.png` en `.prolife/`, se usa ese;
 * si no, el nombre escrito. Se sube desde Ajustes.
 */
export default function Brand({ subtitle, size = 30 }) {
  const [logo, setLogo] = useState(null)

  useEffect(() => {
    let alive = true
    const img = new Image()
    // el parámetro sirve para saltarse la caché cuando se cambia el logo
    img.src = api.raw(LOGO_PATH) + `&v=${localStorage.getItem('prolife.logoV') || '0'}`
    img.onload = () => alive && setLogo(img.src)
    img.onerror = () => alive && setLogo(false)
    return () => { alive = false }
  }, [])

  return (
    <div className="brand">
      {logo ? (
        <img src={logo} alt="prolife" style={{ height: size, width: 'auto', maxWidth: '100%', objectFit: 'contain' }} />
      ) : (
        <h1>pro<em>life</em></h1>
      )}
      {subtitle ? <small>{subtitle}</small> : null}
    </div>
  )
}

/** Después de subir un logo nuevo hay que forzar que se relea. */
export const bumpLogo = () => localStorage.setItem('prolife.logoV', String(Date.now()))
