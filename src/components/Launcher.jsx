import React from 'react'
import Icon from './Icon.jsx'
import { api, enDrive } from '../lib/api.js'
import { useStore, PALETTE } from '../lib/store.jsx'

export const initials = (n) =>
  String(n).replace(/[^\p{L} ]/gu, '').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

export const tileColor = (i = 0) => PALETTE[(i + 1) % PALETTE.length]

/** Portales y enlaces propios. El ayudante vive en el panel lateral, no aquí. */
export default function Launcher({ compact, onOpenDock }) {
  const { db, toast } = useStore()
  const s = db.settings

  const open = async (url, name) => {
    try { await api.openUrl(url); toast(`Abriendo ${name}`) } catch (e) { toast(e.message, 'err') }
  }

  const Tile = ({ name, url, color, icon, onClick }) => (
    <button className="link-tile" onClick={onClick || (() => open(url, name))} title={url}>
      <span className="glyph" style={{ background: color }}>{icon || initials(name)}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <span className="spacer" />
      <Icon name={onClick ? 'chevronR' : 'external'} size={11} style={{ opacity: 0.35 }} />
    </button>
  )

  const grid = { display: 'grid', gap: 5, gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fill, minmax(170px, 1fr))' }

  return (
    <div className="stack" style={{ gap: compact ? 8 : 14 }}>
      {onOpenDock && !enDrive && (
        <>
          {!compact && <div className="eyebrow">Ayudante</div>}
          <button className="link-tile" onClick={onOpenDock}>
            <span className="glyph" style={{ background: 'var(--ink)' }}><Icon name="sparkle" size={11} /></span>
            <span>Abrir el ayudante</span>
            <span className="spacer" />
            <span className="kbd">Ctrl I</span>
          </button>
        </>
      )}

      {(s.portalUrl || (s.links || []).length > 0) && (
        <>
          {!compact && <div className="eyebrow" style={{ marginTop: 4 }}>Portales y enlaces</div>}
          <div style={grid}>
            {s.portalUrl && <Tile name={s.portalName || 'Portal universitario'} url={s.portalUrl} color="var(--ink)" icon="U" />}
            {(s.links || []).map((l, i) => <Tile key={l.id} name={l.name} url={l.url} color={tileColor(i)} />)}
          </div>
        </>
      )}

      {!compact && !s.portalUrl && (s.links || []).length === 0 && (
        <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
          Añade tu campus y tus enlaces en Ajustes y aparecerán aquí.
        </p>
      )}
    </div>
  )
}
