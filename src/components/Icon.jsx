import React from 'react'

const P = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
  book: 'M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5zM8 3v18',
  briefcase: 'M3 8h18v12H3zM8 8V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V8M3 13h18',
  check: 'M4 12.5 9 17.5 20 6.5',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  heart: 'M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13z',
  calendar: 'M3 6.5h18V21H3zM3 11h18M8 3v5M16 3v5',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  folder: 'M3 6.5h6l2 2.5h10V19H3z',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 2.2 14H2a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  play: 'M7 4.5v15l13-7.5z',
  stop: 'M6 6h12v12H6z',
  chevronL: 'M15 5l-7 7 7 7',
  chevronR: 'M9 5l7 7-7 7',
  chevronD: 'M6 9l6 6 6-6',
  upload: 'M12 17V4M6.5 9.5 12 4l5.5 5.5M4 20h16',
  download: 'M12 4v13M6.5 11.5 12 17l5.5-5.5M4 20h16',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L20 8l-4-4L4 16zM14 6l4 4',
  code: 'M8 6 2 12l6 6M16 6l6 6-6 6',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5.5l3.5 2',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.5-4.5',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5',
  sparkle: 'M12 3l2.2 6.3L21 12l-6.8 2.7L12 21l-2.2-6.3L3 12l6.8-2.7z',
  arrowUp: 'M12 20V5M6 11l6-6 6 6',
  arrowDown: 'M12 4v15M18 13l-6 6-6-6',
  pin: 'M12 21v-7M8 3h8l-1 6 3 3H6l3-3z',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  eye: 'M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  save: 'M4 4h12l4 4v12H4zM8 4v6h8V4M8 20v-6h8v6',
  refresh: 'M20 12a8 8 0 1 1-2.4-5.7M20 3v5h-5',
  dumbbell: 'M4 9v6M7 6v12M17 6v12M20 9v6M7 12h10',
  moon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  grad: 'M2 8.5 12 4l10 4.5L12 13zM6 10.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5',
}

export default function Icon({ name, size = 15, stroke = 1.6, fill, ...rest }) {
  const d = P[name] || P.file
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill || 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: `0 0 ${size}px` }}
      {...rest}
    >
      <path d={d} />
    </svg>
  )
}

export const KIND_ICON = {
  folder: 'folder',
  pdf: 'file',
  image: 'eye',
  markdown: 'edit',
  text: 'file',
  code: 'code',
  office: 'file',
  video: 'play',
  audio: 'activity',
  archive: 'layers',
  file: 'file',
}

export const KIND_COLOR = {
  folder: 'var(--amber)',
  pdf: 'var(--accent)',
  image: 'var(--green)',
  markdown: 'var(--blue)',
  text: 'var(--ink-3)',
  code: 'var(--blue)',
  office: 'var(--blue)',
  video: 'var(--accent)',
  audio: 'var(--green)',
  archive: 'var(--ink-3)',
  file: 'var(--ink-3)',
}
