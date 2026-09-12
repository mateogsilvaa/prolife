/**
 * Sacar texto de un archivo para poder leerlo, buscarlo o enseñárselo al
 * ayudante.
 *
 * Que el ayudante «no se entere de nada» era en buena parte esto: media carrera
 * está en PDF y en Word, y hasta ahora solo sabía abrir `.md` y `.txt`. Pedirle
 * que opine de un tema cuyo único rastro es un PDF de la asignatura no fallaba
 * por falta de inteligencia, fallaba porque nadie le pasaba el texto.
 *
 * Dos formatos, dos caminos:
 *
 * - **PDF** con `pdfjs-dist`, que es el mismo motor que usa el visor del
 *   navegador. Se pide solo el texto, no el dibujo, así que los avisos sobre
 *   `DOMMatrix` o las fuentes que salen por consola no importan: eso es para
 *   pintar páginas y aquí no se pinta ninguna.
 *
 * - **DOCX** a mano. Un `.docx` es un zip con un `word/document.xml` dentro, y
 *   leerlo son sesenta líneas de cabeceras y un `inflateRaw` que Node ya trae.
 *   Se hace así y no con una librería porque meter un dependencia entera para
 *   descomprimir un único fichero conocido es pagar de más.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

/** Hasta aquí lee. Más que esto no le cabe al modelo en la cabeza de todos modos. */
export const LIMITE = 200_000

const TEXTO = new Set([
  '.md', '.markdown', '.txt', '.text', '.csv', '.tsv', '.json', '.yml', '.yaml', '.xml', '.html',
  '.htm', '.css', '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.h', '.cpp', '.hpp', '.cs',
  '.go', '.rs', '.rb', '.php', '.sh', '.sql', '.ini', '.cfg', '.conf', '.log', '.tex', '.bib',
])

export const puedeLeer = (nombre) => {
  const ext = path.extname(nombre).toLowerCase()
  return TEXTO.has(ext) || ext === '.pdf' || ext === '.docx'
}

/* ------------------------------------------------------------------- PDF -- */

let pdfjs = null

async function textoPdf(abs) {
  // Se carga a la primera y no al arrancar: son 12 MB de motor que la mayoría
  // de las veces no hacen falta, y el servidor tiene que abrir rápido.
  pdfjs ||= await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(fs.readFileSync(abs))
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false }).promise
  const partes = []
  let total = 0
  for (let n = 1; n <= doc.numPages && total < LIMITE; n++) {
    const page = await doc.getPage(n)
    const contenido = await page.getTextContent()
    // Los trozos vienen sueltos, uno por fragmento de tipografía, y pdf.js dice
    // en `hasEOL` dónde acababa cada renglón. Sin respetarlo, una tabla o un
    // índice salen como una sola línea de mil caracteres.
    let linea = ''
    const lineas = []
    for (const it of contenido.items) {
      linea += it.str
      if (it.hasEOL) { lineas.push(linea); linea = '' }
    }
    if (linea) lineas.push(linea)
    const texto = lineas.join('\n').replace(/[ \t]+\n/g, '\n').trim()
    total += texto.length
    partes.push({ pagina: n, texto })
  }
  await doc.destroy?.()
  return { texto: partes.map((p) => p.texto).join('\n\n'), paginas: doc.numPages }
}

/* ------------------------------------------------------------------ DOCX -- */

/** Saca un fichero concreto de dentro de un zip, leyendo su directorio central. */
function delZip(buf, queremos) {
  // El directorio central está al final, detrás de una marca que puede llevar
  // hasta 64 KB de comentario detrás: se busca hacia atrás desde el final.
  let fin = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fin = i; break }
  }
  if (fin < 0) return null

  const cuantos = buf.readUInt16LE(fin + 10)
  let p = buf.readUInt32LE(fin + 16)

  for (let i = 0; i < cuantos; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null
    const metodo = buf.readUInt16LE(p + 10)
    const comprimido = buf.readUInt32LE(p + 20)
    const nombreLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const comentLen = buf.readUInt16LE(p + 32)
    const desde = buf.readUInt32LE(p + 42)
    const nombre = buf.toString('utf8', p + 46, p + 46 + nombreLen)

    if (nombre === queremos) {
      // La cabecera local repite los tamaños de nombre y extra, y no tienen por
      // qué coincidir con los del directorio: hay que leerlos de ahí.
      if (buf.readUInt32LE(desde) !== 0x04034b50) return null
      const nl = buf.readUInt16LE(desde + 26)
      const el = buf.readUInt16LE(desde + 28)
      const datos = buf.subarray(desde + 30 + nl + el, desde + 30 + nl + el + comprimido)
      if (metodo === 0) return datos
      if (metodo === 8) return zlib.inflateRawSync(datos)
      return null
    }
    p += 46 + nombreLen + extraLen + comentLen
  }
  return null
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/**
 * Deshace las entidades XML en una sola pasada.
 *
 * De una pasada y no de varias a propósito: encadenar reemplazos convierte
 * `&amp;lt;` —un «&lt;» escrito tal cual en el documento— en un «<», y a partir
 * de ahí el texto miente sobre lo que ponía. Las numéricas hacen falta porque
 * Word escribe así las tildes en algunos documentos.
 */
const desescapar = (s) =>
  s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g, (todo, dec, hex, nombre) => {
    if (dec) return String.fromCodePoint(Number(dec))
    if (hex) return String.fromCodePoint(parseInt(hex, 16))
    return ENTIDADES[nombre] ?? todo
  })

function textoDocx(abs) {
  const xml = delZip(fs.readFileSync(abs), 'word/document.xml')
  if (!xml) return null
  const crudo = xml
    .toString('utf8')
    // Los saltos de párrafo y de línea son etiquetas, no caracteres: si se
    // quitan como las demás, el documento entero sale en un solo renglón.
    .replace(/<w:p\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br\b[^>]*\/?>/g, '\n')
    .replace(/<w:tab\b[^>]*\/?>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return desescapar(crudo)
}

/* ------------------------------------------------------------------------- */

/**
 * El texto de un archivo, sea del formato que sea.
 *
 * Devuelve `{ texto, paginas, recortado }`, o lanza si el formato no se sabe
 * leer — decirlo claro vale más que devolver una cadena vacía que el modelo
 * interpretaría como «el documento está en blanco».
 */
export async function extraerTexto(abs, nombre = path.basename(abs)) {
  const ext = path.extname(nombre).toLowerCase()

  let texto = null
  let paginas = null

  if (ext === '.pdf') {
    const r = await textoPdf(abs)
    texto = r.texto
    paginas = r.paginas
  } else if (ext === '.docx') {
    texto = textoDocx(abs)
    if (texto == null) throw Object.assign(new Error('Ese .docx no se ha podido abrir'), { status: 415 })
  } else if (TEXTO.has(ext)) {
    texto = fs.readFileSync(abs, 'utf8')
  } else {
    throw Object.assign(
      new Error(`No sé leer un ${ext || 'archivo sin extensión'}. Puedo con texto, PDF y Word (.docx).`),
      { status: 415 }
    )
  }

  const recortado = texto.length > LIMITE
  return { texto: recortado ? texto.slice(0, LIMITE) : texto, paginas, recortado }
}
