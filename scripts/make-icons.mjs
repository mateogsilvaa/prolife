/**
 * Genera los iconos de la app instalable. Se ejecuta a mano cuando cambie la
 * marca (`node scripts/make-icons.mjs`); el resultado se guarda en `public/` y
 * va al repositorio, para que compilar no dependa de esto.
 *
 * Se escribe el PNG a pelo —cabecera, datos comprimidos con zlib y CRC— en vez
 * de traer una librería de imágenes para dibujar dos figuras.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

const PAPER = [0xf5, 0xf3, 0xee]
const INK = [0x1a, 0x18, 0x15]
const ACCENT = [0xbf, 0x3f, 0x24]

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, pixel) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filtro «ninguno»
    for (let x = 0; x < size; x++) {
      const [r, g, b, a = 255] = pixel(x, y)
      const at = y * (stride + 1) + 1 + x * 4
      raw[at] = r
      raw[at + 1] = g
      raw[at + 2] = b
      raw[at + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * La marca: una «p» de palo y panza sobre papel, con la panza en bermellón —el
 * único acento del sistema visual de la app.
 *
 * `inset` deja aire alrededor para el icono «maskable», que Android recorta en
 * la forma que tenga el lanzador (círculo, cuadrado redondeado…).
 */
function mark(size, inset = 0) {
  const pad = size * inset
  const box = size - pad * 2
  const u = box / 10 // unidad de trazo

  const stemTop = pad + box * 0.24
  const stemBottom = pad + box * 0.86
  const bowlR = box * 0.2

  // La «p» se centra por su caja real (palo + panza), no por el palo: si no,
  // el conjunto queda escorado a la izquierda dentro del icono.
  let stemX = pad + box * 0.3
  const width = u * 0.5 + (stemX + u * 0.5 + bowlR * 0.75 + bowlR - (stemX - u * 0.5))
  stemX = pad + (box - width) / 2 + u * 0.5
  const bowlX = stemX + u * 0.5 + bowlR * 0.75
  const bowlY = pad + box * 0.44

  return (x, y) => {
    const cx = x + 0.5
    const cy = y + 0.5

    // El palo va por delante: así la unión con la panza se lee como una letra
    // y no como un anillo cruzado por una barra.
    if (cx >= stemX - u * 0.5 && cx <= stemX + u * 0.5 && cy >= stemTop && cy <= stemBottom) return INK

    const d = Math.hypot(cx - bowlX, cy - bowlY)
    if (d <= bowlR) return d >= bowlR - u * 0.95 ? ACCENT : PAPER

    return PAPER
  }
}

fs.mkdirSync(OUT, { recursive: true })
const files = [
  ['icon-192.png', 192, 0.06],
  ['icon-512.png', 512, 0.06],
  // Android recorta el maskable: todo lo importante tiene que caber en el 80% central.
  ['icon-maskable-512.png', 512, 0.18],
]
for (const [name, size, inset] of files) {
  fs.writeFileSync(path.join(OUT, name), png(size, mark(size, inset)))
  console.log('escrito', name)
}
