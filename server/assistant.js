/**
 * Puente con Ollama, que corre en el propio ordenador.
 *
 * El servidor solo hace de pasarela: recibe la conversación ya montada por la
 * interfaz, se la pasa a Ollama y devuelve la respuesta. No toca la base de
 * datos. Las herramientas que el modelo decide usar las ejecuta la interfaz,
 * que es la única dueña del `db.json`: así no hay dos escritores peleándose.
 */

const DEFAULT_URL = 'http://127.0.0.1:11434'

/** Solo se permite hablar con un Ollama local: esto no es un proxy abierto. */
function safeBase(url) {
  const base = String(url || DEFAULT_URL).trim().replace(/\/+$/, '')
  let u
  try {
    u = new URL(base)
  } catch {
    throw Object.assign(new Error('La dirección de Ollama no es válida'), { status: 400 })
  }
  const local = ['127.0.0.1', 'localhost', '::1', '0.0.0.0', '[::1]']
  if (!local.includes(u.hostname)) {
    throw Object.assign(new Error('El ayudante solo habla con un Ollama en tu propio ordenador'), { status: 400 })
  }
  return `${u.protocol}//${u.host}`
}

async function call(url, path, opts = {}, timeoutMs = 120000) {
  const res = await fetch(safeBase(url) + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw Object.assign(new Error(text?.slice(0, 300) || `Ollama devolvió ${res.status}`), { status: 502 })
  }
  return res.json()
}

/** ¿Está Ollama levantado y qué modelos hay descargados? */
export async function status(url) {
  try {
    const data = await call(url, '/api/tags', {}, 4000)
    const models = (data.models || [])
      .map((m) => ({ name: m.name, size: m.size, family: m.details?.family || '' }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return { running: true, models }
  } catch (e) {
    return { running: false, models: [], error: e.name === 'TimeoutError' ? 'Ollama no responde' : e.message }
  }
}

/**
 * Un turno de conversación. `tools` viaja tal cual: Ollama devuelve
 * `message.tool_calls` cuando el modelo quiere que hagamos algo por él.
 */
export async function chat(url, { model, messages, tools, temperature }) {
  if (!model) throw Object.assign(new Error('No hay ningún modelo elegido'), { status: 400 })
  const data = await call(url, '/api/chat', {
    method: 'POST',
    body: {
      model,
      messages,
      stream: false,
      ...(tools?.length ? { tools } : {}),
      options: { temperature: temperature ?? 0.2, num_ctx: 8192 },
    },
  })
  return { message: data.message || { role: 'assistant', content: '' }, done: data.done !== false }
}
