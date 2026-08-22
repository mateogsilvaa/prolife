const base = ''

async function req(url, opts = {}) {
  const res = await fetch(base + url, {
    headers: opts.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body instanceof FormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}))
    throw new Error(msg.error || `Error ${res.status}`)
  }
  return res.json()
}

export const api = {
  health: () => req('/api/health'),
  getConfig: () => req('/api/config'),
  setConfig: (body) => req('/api/config', { method: 'PUT', body }),

  syncRoots: () => req('/api/sync/roots'),

  getDb: () => req('/api/db'),
  putDb: (body) => req('/api/db', { method: 'PUT', body }),
  dbStamp: () => req('/api/db/stamp'),

  list: (p = '') => req(`/api/fs/list?p=${encodeURIComponent(p)}`),
  tree: (p = '') => req(`/api/fs/tree?p=${encodeURIComponent(p)}`),
  mkdir: (p) => req('/api/fs/mkdir', { method: 'POST', body: { p } }),
  readText: (p) => req(`/api/fs/text?p=${encodeURIComponent(p)}`),
  writeText: (p, content) => req('/api/fs/text', { method: 'PUT', body: { p, content } }),
  rename: (p, name) => req('/api/fs/rename', { method: 'POST', body: { p, name } }),
  remove: (p) => req('/api/fs/delete', { method: 'POST', body: { p } }),

  upload: (p, files) => {
    const fd = new FormData()
    fd.append('p', p)
    for (const f of files) fd.append('files', f)
    return req('/api/fs/upload', { method: 'POST', body: fd })
  },

  /** URL directa para <iframe>/<img>: sirve el archivo real desde el disco. */
  raw: (p, download) => `/api/fs/raw?p=${encodeURIComponent(p)}${download ? '&download=1' : ''}`,

  codeStatus: () => req('/api/code/status'),
  codeAccept: (accepted) => req('/api/code/accept', { method: 'POST', body: { accepted } }),
  codeStart: (folder) => req('/api/code/start', { method: 'POST', body: { folder } }),
  codeStop: () => req('/api/code/stop', { method: 'POST', body: {} }),

  aiStatus: (url) => req(`/api/ai/status?url=${encodeURIComponent(url || '')}`),
  aiChat: (body) => req('/api/ai/chat', { method: 'POST', body }),

  openUrl: (url) => req('/api/open', { method: 'POST', body: { url } }),
  openPath: (p) => req('/api/open', { method: 'POST', body: { p } }),
  openInCode: (p) => req('/api/open', { method: 'POST', body: { p, app: 'code' } }),
  reveal: (p) => req('/api/open', { method: 'POST', body: { p, app: 'reveal' } }),
}
