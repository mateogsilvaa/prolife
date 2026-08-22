import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import Icon, { KIND_ICON, KIND_COLOR } from './Icon.jsx'
import Editor from './Editor.jsx'
import BrowserPane from './BrowserPane.jsx'
import CodePane from './CodePane.jsx'
import { api } from '../lib/api.js'
import { useStore, uid } from '../lib/store.jsx'
import { useUI } from '../lib/ui.jsx'

marked.setOptions({ breaks: true, gfm: true })

const kb = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`)
const AUTOSAVE_MS = 1800
const MAX_PANES = 3
const emptyPane = () => ({ id: uid('p'), tabs: [], active: null })

/**
 * Espacio de trabajo. Un árbol de archivos plegable y hasta tres paneles que
 * pueden contener archivos, un navegador o VS Code empotrado, en columnas o
 * en filas. Todo lo prescindible se puede esconder: en un portátil de 16" el
 * sitio útil es lo que más escasea.
 */
export default function Workspace({ root }) {
  const { toast } = useStore()
  const ui = useUI()

  const [tree, setTree] = useState(null)
  const [open, setOpen] = useState(() => new Set())
  const [docs, setDocs] = useState({})
  const [panes, setPanes] = useState([emptyPane()])
  const [focusPane, setFocusPane] = useState(0)
  const [dir, setDir] = useState('row')
  const [rail, setRail] = useState(true)
  const [railWidth, setRailWidth] = useState(230)
  const [maximized, setMaximized] = useState(null)
  const [sizes, setSizes] = useState([1])
  const panesRef = useRef(null)
  const [over, setOver] = useState(false)
  const [menu, setMenu] = useState(false)
  const [filter, setFilter] = useState('')

  const input = useRef(null)
  const docsRef = useRef(docs)
  useEffect(() => { docsRef.current = docs }, [docs])

  /* ------------------------------------------------------------- árbol */

  const loadTree = useCallback(async () => {
    if (root == null) return
    try { setTree(await api.tree(root)) } catch (e) { toast(e.message, 'err') }
  }, [root, toast])

  useEffect(() => { loadTree() }, [loadTree])

  /* --------------------------------------------------------- persistencia */

  const storeKey = root == null ? null : 'prolife.ws2:' + root

  useEffect(() => {
    if (!storeKey) return
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || 'null')
      if (saved?.panes?.length) {
        setPanes(saved.panes)
        setDir(saved.dir || 'row')
        setRail(saved.rail !== false)
        setSizes(saved.sizes?.length === saved.panes.length ? saved.sizes : saved.panes.map(() => 1))
        for (const p of saved.panes) for (const t of p.tabs) if (t.type === 'file') hydrate(t.file)
      } else {
        setPanes([emptyPane()])
      }
    } catch {
      setPanes([emptyPane()])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey])

  useEffect(() => {
    if (storeKey) localStorage.setItem(storeKey, JSON.stringify({ panes, dir, rail, sizes }))
  }, [storeKey, panes, dir, rail, sizes])

  // los tamaños siguen al número de paneles
  useEffect(() => {
    setSizes((s) => (s.length === panes.length ? s : panes.map((_, i) => s[i] ?? 1)))
  }, [panes.length])

  /** Arrastrar la línea entre dos paneles reparte el espacio entre ambos. */
  const dragDivider = (i) => (e) => {
    e.preventDefault()
    const host = panesRef.current
    if (!host) return
    const horizontal = dir === 'row'
    const total = horizontal ? host.clientWidth : host.clientHeight
    const start = horizontal ? e.clientX : e.clientY
    const a0 = sizes[i] ?? 1
    const b0 = sizes[i + 1] ?? 1
    const sum = a0 + b0
    const move = (ev) => {
      const delta = ((horizontal ? ev.clientX : ev.clientY) - start) / total
      const shift = delta * (sizes.reduce((x, y) => x + y, 0) || 1)
      const a = Math.max(0.15, Math.min(sum - 0.15, a0 + shift))
      setSizes((s) => s.map((v, j) => (j === i ? a : j === i + 1 ? sum - a : v)))
    }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  /* --------------------------------------------------------- documentos */

  const hydrate = useCallback(
    async (file) => {
      const p = file.path
      if (docsRef.current[p]?.content != null) return
      setDocs((d) => ({ ...d, [p]: { file, content: null, dirty: false, mode: file.kind === 'markdown' ? 'split' : 'edit' } }))
      if (!file.editable) return
      try {
        const r = await api.readText(p)
        setDocs((d) => ({ ...d, [p]: { ...d[p], file, content: r.content } }))
      } catch (e) {
        toast(e.message, 'err')
      }
    },
    [toast]
  )

  const addTab = useCallback((tab, paneIndex = focusPane) => {
    setPanes((ps) => {
      const next = ps.map((p) => ({ ...p, tabs: [...p.tabs] }))
      while (next.length <= paneIndex) next.push(emptyPane())
      const pane = next[paneIndex]
      const existing = tab.type === 'file' ? pane.tabs.find((t) => t.type === 'file' && t.path === tab.path) : null
      if (existing) pane.active = existing.id
      else { pane.tabs.push(tab); pane.active = tab.id }
      return next
    })
    setFocusPane(paneIndex)
    setMaximized(null)
  }, [focusPane])

  const openFile = useCallback(
    (file, paneIndex) => {
      if (file.dir) return
      hydrate(file)
      addTab({ id: uid('tab'), type: 'file', path: file.path, name: file.name, file }, paneIndex)
    },
    [hydrate, addTab]
  )

  const openBrowser = (url = '', paneIndex) =>
    addTab({ id: uid('tab'), type: 'browser', url, name: 'Navegador' }, paneIndex)

  const openCode = (paneIndex) =>
    addTab({ id: uid('tab'), type: 'code', name: 'VS Code' }, paneIndex)

  const closeTab = (paneIndex, tabId) => {
    setPanes((ps) => {
      let next = ps.map((p) => ({ ...p, tabs: p.tabs.filter((t) => t.id !== tabId) }))
      const pane = next[paneIndex]
      if (pane && pane.active === tabId) pane.active = pane.tabs[pane.tabs.length - 1]?.id || null
      if (next.length > 1) next = next.filter((p) => p.tabs.length > 0)
      if (!next.length) next = [emptyPane()]
      return next
    })
    setFocusPane((i) => Math.max(0, Math.min(i, panes.length - 2)))
    setMaximized(null)
  }

  const save = useCallback(
    async (path) => {
      const doc = docsRef.current[path]
      if (!doc?.dirty || doc.content == null) return
      try {
        await api.writeText(path, doc.content)
        setDocs((d) => ({ ...d, [path]: { ...d[path], dirty: false } }))
      } catch (e) {
        toast(e.message, 'err')
      }
    },
    [toast]
  )

  const edit = (path, content) => setDocs((d) => ({ ...d, [path]: { ...d[path], content, dirty: true } }))

  useEffect(() => {
    const dirty = Object.entries(docs).filter(([, d]) => d.dirty)
    if (!dirty.length) return
    const t = setTimeout(() => dirty.forEach(([p]) => save(p)), AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [docs, save])

  /* ---------------------------------------------------------- atajos */

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        Object.entries(docsRef.current).filter(([, d]) => d.dirty).forEach(([p]) => save(p))
        toast('Guardado')
      } else if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault(); setRail((v) => !v)
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault(); ui.toggleZen()
      } else if (mod && e.key === '\\') {
        e.preventDefault()
        setPanes((ps) => {
          if (ps.length >= MAX_PANES) return ps
          const active = ps[focusPane]?.tabs.find((t) => t.id === ps[focusPane].active)
          return [...ps, active ? { id: uid('p'), tabs: [{ ...active, id: uid('tab') }], active: null } : emptyPane()]
            .map((p, i, arr) => (i === arr.length - 1 && p.tabs.length ? { ...p, active: p.tabs[0].id } : p))
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, toast, ui, focusPane])

  /* ------------------------------------------------------------ acciones */

  const currentDir = useMemo(() => {
    const pane = panes[focusPane]
    const tab = pane?.tabs.find((t) => t.id === pane.active)
    if (tab?.type !== 'file') return root
    return tab.path.split('/').slice(0, -1).join('/') || root
  }, [panes, focusPane, root])

  const upload = async (files, dirPath = currentDir) => {
    if (!files?.length) return
    try {
      const r = await api.upload(dirPath, files)
      toast(`${r.files.length} archivo${r.files.length > 1 ? 's' : ''} guardado${r.files.length > 1 ? 's' : ''}`)
      await loadTree()
      if (r.files.length === 1) openFile(r.files[0])
    } catch (e) { toast(e.message, 'err') }
  }

  const newNote = async () => {
    const name = prompt('Nombre de la nota', 'apuntes.md')
    if (!name) return
    const file = name.includes('.') ? name : `${name}.md`
    const p = `${currentDir}/${file}`
    await api.writeText(p, `# ${file.replace(/\.[^.]+$/, '')}\n\n`)
    await loadTree()
    openFile({ path: p, name: file, kind: file.endsWith('.md') ? 'markdown' : 'text', editable: true, ext: '.' + file.split('.').pop() })
  }

  const newFolder = async () => {
    const name = prompt('Nombre de la carpeta')
    if (!name) return
    await api.mkdir(`${currentDir}/${name.replace(/[\\/:*?"<>|]/g, '-')}`)
    loadTree()
  }

  const remove = async (file) => {
    if (!confirm(`¿Eliminar "${file.name}" del disco?`)) return
    await api.remove(file.path)
    setPanes((ps) => ps.map((p) => ({ ...p, tabs: p.tabs.filter((t) => t.path !== file.path) })))
    loadTree()
  }

  const rename = async (file) => {
    const name = prompt('Nuevo nombre', file.name)
    if (!name || name === file.name) return
    await api.rename(file.path, name)
    loadTree()
  }

  const dragRail = (e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = railWidth
    const move = (ev) => setRailWidth(Math.min(460, Math.max(150, startW + ev.clientX - startX)))
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const visiblePanes = maximized !== null ? [panes[maximized]].filter(Boolean) : panes

  return (
    <div
      className="ws"
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files) }}
    >
      {rail && (
        <>
          <aside className="ws-rail" style={{ width: railWidth, flex: `0 0 ${railWidth}px` }}>
            <div className="ws-rail-head">
              <input
                className="input"
                style={{ padding: '3px 8px', fontSize: 12 }}
                placeholder="Filtrar…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <button className="btn ghost icon" title="Nueva nota" onClick={newNote}><Icon name="edit" size={13} /></button>
              <button className="btn ghost icon" title="Nueva carpeta" onClick={newFolder}><Icon name="folder" size={13} /></button>
              <button className="btn ghost icon" title="Subir archivos" onClick={() => input.current?.click()}><Icon name="upload" size={13} /></button>
            </div>
            <input ref={input} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = '' }} />

            <div className={`ws-tree${over ? ' over' : ''}`}>
              {tree?.items?.length ? (
                <Tree
                  items={tree.items}
                  filter={filter.toLowerCase()}
                  open={open}
                  toggle={(p) => setOpen((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n })}
                  onOpen={(f) => openFile(f)}
                  onSide={(f) => openFile(f, Math.min(panes.length, MAX_PANES - 1))}
                  onRename={rename}
                  onRemove={remove}
                  activePaths={panes.flatMap((p) => p.tabs.filter((t) => t.type === 'file').map((t) => t.path))}
                  depth={0}
                />
              ) : (
                <button className="ws-empty" onClick={() => input.current?.click()}>
                  <Icon name="upload" size={18} />
                  <span>Arrastra aquí tus apuntes, PDFs o entregas</span>
                </button>
              )}
            </div>

            <div className="ws-rail-foot">
              <button className="btn sm ghost" onClick={() => api.openPath(root)} title="Abrir la carpeta en el explorador">
                <Icon name="external" size={12} /> Carpeta
              </button>
              <button className="btn sm ghost" onClick={loadTree} title="Recargar"><Icon name="refresh" size={12} /></button>
            </div>
          </aside>
          <div className="ws-drag" onMouseDown={dragRail} />
        </>
      )}

      <div className="ws-main">
        <div className="ws-toolbar">
          <button className="btn ghost icon" title={`${rail ? 'Ocultar' : 'Mostrar'} archivos (Ctrl+E)`} onClick={() => setRail(!rail)}>
            <Icon name="folder" size={13} style={{ opacity: rail ? 1 : 0.45 }} />
          </button>
          <button className="btn ghost icon" title={`${ui.sidebar ? 'Ocultar' : 'Mostrar'} menú lateral (Ctrl+B)`} onClick={ui.toggleSidebar}>
            <Icon name="layers" size={13} style={{ opacity: ui.sidebar ? 1 : 0.45 }} />
          </button>

          <div className="ws-sep" />

          <div className="menu-wrap">
            <button className="btn sm" onClick={() => setMenu(!menu)}>
              <Icon name="plus" size={12} /> Abrir <Icon name="chevronD" size={11} />
            </button>
            {menu && (
              <>
                <div className="menu-back" onClick={() => setMenu(false)} />
                <div className="menu">
                  <button onClick={() => { openBrowser(); setMenu(false) }}><Icon name="search" size={13} /> Navegador</button>
                  <button onClick={() => { openCode(); setMenu(false) }}><Icon name="code" size={13} /> VS Code aquí dentro</button>
                  <button onClick={() => { newNote(); setMenu(false) }}><Icon name="edit" size={13} /> Nota nueva</button>
                  <button onClick={() => { input.current?.click(); setMenu(false) }}><Icon name="upload" size={13} /> Subir archivo</button>
                </div>
              </>
            )}
          </div>

          <button
            className="btn ghost icon"
            title="Dividir (Ctrl+\)"
            disabled={panes.length >= MAX_PANES}
            onClick={() => setPanes((ps) => [...ps, emptyPane()])}
          >
            <Icon name="layers" size={13} />
          </button>
          <button
            className="btn ghost icon"
            title={dir === 'row' ? 'Cambiar a filas' : 'Cambiar a columnas'}
            onClick={() => setDir(dir === 'row' ? 'column' : 'row')}
          >
            <Icon name={dir === 'row' ? 'chart' : 'layers'} size={13} />
          </button>

          <div className="spacer" />
          <span className="dim" style={{ fontSize: 11 }}>{panes.length} {panes.length === 1 ? 'panel' : 'paneles'}</span>
          <button className="btn ghost icon" title="Modo concentración (Ctrl+Shift+Z)" onClick={ui.toggleZen}>
            <Icon name={ui.zen ? 'eye' : 'sparkle'} size={13} />
          </button>
        </div>

        <div className="ws-panes" ref={panesRef} style={{ flexDirection: dir }}>
          {visiblePanes.map((pane, vi) => {
            const i = maximized !== null ? maximized : vi
            return (
              <React.Fragment key={pane.id}>
                {vi > 0 && (
                  <div
                    className={`ws-divider ${dir}`}
                    onMouseDown={dragDivider(i - 1)}
                    onDoubleClick={() => setSizes(panes.map(() => 1))}
                    title="Arrastra para repartir el espacio · doble clic para igualar"
                  />
                )}
                <Pane
                  pane={pane}
                  index={i}
                  grow={maximized !== null ? 1 : sizes[i] ?? 1}
                  docs={docs}
                  focused={focusPane === i}
                  maximized={maximized === i}
                  canSplit={panes.length < MAX_PANES}
                  onFocus={() => setFocusPane(i)}
                  onActivate={(id) => setPanes((ps) => ps.map((x, j) => (j === i ? { ...x, active: id } : x)))}
                  onClose={(id) => closeTab(i, id)}
                  onEdit={edit}
                  onSave={save}
                  onMode={(p, mode) => setDocs((d) => ({ ...d, [p]: { ...d[p], mode } }))}
                  onMaximize={() => setMaximized(maximized === i ? null : i)}
                  onSplit={() => setPanes((ps) => (ps.length >= MAX_PANES ? ps : [...ps, emptyPane()]))}
                  onNewBrowser={() => openBrowser('', i)}
                  onNewCode={() => openCode(i)}
                  onUrl={(id, url) =>
                    setPanes((ps) => ps.map((x, j) => (j === i ? { ...x, tabs: x.tabs.map((t) => (t.id === id ? { ...t, url } : t)) } : x)))
                  }
                  root={root}
                />
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ árbol */

function Tree({ items, filter, open, toggle, onOpen, onSide, onRename, onRemove, activePaths, depth }) {
  const match = (it) => {
    if (!filter) return true
    if (it.name.toLowerCase().includes(filter)) return true
    return it.dir && (it.children || []).some(match)
  }

  return items.filter(match).map((it) => (
    <div key={it.path}>
      <div
        className={`ws-node${activePaths.includes(it.path) ? ' on' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => (it.dir ? toggle(it.path) : onOpen(it))}
      >
        {it.dir ? (
          <Icon name="chevronR" size={11} style={{ transform: open.has(it.path) || filter ? 'rotate(90deg)' : 'none', transition: 'transform .12s', opacity: 0.55 }} />
        ) : (
          <Icon name={KIND_ICON[it.kind]} size={12} style={{ color: KIND_COLOR[it.kind] }} />
        )}
        <span className="ws-node-name">{it.name}</span>
        <span className="ws-node-actions">
          {!it.dir && <button title="Abrir al lado" onClick={(e) => { e.stopPropagation(); onSide(it) }}><Icon name="layers" size={11} /></button>}
          <button title="Renombrar" onClick={(e) => { e.stopPropagation(); onRename(it) }}><Icon name="edit" size={11} /></button>
          <button title="Eliminar" onClick={(e) => { e.stopPropagation(); onRemove(it) }}><Icon name="trash" size={11} /></button>
        </span>
      </div>
      {it.dir && (open.has(it.path) || filter) && it.children?.length > 0 && (
        <Tree items={it.children} {...{ filter, open, toggle, onOpen, onSide, onRename, onRemove, activePaths }} depth={depth + 1} />
      )}
    </div>
  ))
}

/* ----------------------------------------------------------------- panel */

function Pane({
  pane, index, docs, focused, maximized, canSplit, root, grow = 1,
  onFocus, onActivate, onClose, onEdit, onSave, onMode, onMaximize, onSplit, onNewBrowser, onNewCode, onUrl,
}) {
  const tab = pane.tabs.find((t) => t.id === pane.active)
  const doc = tab?.type === 'file' ? docs[tab.path] : null

  return (
    <section className={`ws-pane${focused ? ' focused' : ''}`} style={{ flexGrow: grow }} onMouseDown={onFocus}>
      <div className="ws-tabs" onDoubleClick={onMaximize}>
        {pane.tabs.map((t) => {
          const d = t.type === 'file' ? docs[t.path] : null
          const icon = t.type === 'browser' ? 'search' : t.type === 'code' ? 'code' : KIND_ICON[t.file?.kind] || 'file'
          const color = t.type === 'file' ? KIND_COLOR[t.file?.kind] : 'var(--ink-3)'
          return (
            <button key={t.id} className={`ws-tab${pane.active === t.id ? ' on' : ''}`} onClick={() => onActivate(t.id)}>
              <Icon name={icon} size={11} style={{ color }} />
              <span>{t.type === 'file' ? t.path.split('/').pop() : t.name}</span>
              {d?.dirty && <span className="ws-dot" title="Sin guardar" />}
              <span className="ws-x" onClick={(e) => { e.stopPropagation(); onClose(t.id) }}><Icon name="x" size={10} /></span>
            </button>
          )
        })}
        <div className="spacer" />
        <div className="ws-tools">
          {tab?.type === 'file' && tab.file?.kind === 'markdown' && (
            <div className="seg tiny">
              {[['edit', 'Editar'], ['split', 'Ambos'], ['read', 'Leer']].map(([k, l]) => (
                <button key={k} className={doc?.mode === k ? 'on' : ''} onClick={() => onMode(tab.path, k)}>{l}</button>
              ))}
            </div>
          )}
          {tab?.type === 'file' && (
            <button className="btn ghost icon" title="Abrir con la app del sistema" onClick={() => api.openPath(tab.path)}>
              <Icon name="external" size={13} />
            </button>
          )}
          <button className="btn ghost icon" title={maximized ? 'Restaurar' : 'Maximizar panel'} onClick={onMaximize}>
            <Icon name={maximized ? 'download' : 'arrowUp'} size={13} />
          </button>
        </div>
      </div>

      <div className="ws-body">
        {!tab ? (
          <div className="ws-blank">
            <div className="display">Panel vacío</div>
            <p className="dim">Elige un archivo, o abre aquí otra cosa.</p>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm" onClick={onNewBrowser}><Icon name="search" size={12} /> Navegador</button>
              <button className="btn sm" onClick={onNewCode}><Icon name="code" size={12} /> VS Code</button>
              {canSplit && <button className="btn sm ghost" onClick={onSplit}><Icon name="layers" size={12} /> Dividir</button>}
            </div>
          </div>
        ) : tab.type === 'browser' ? (
          <BrowserPane tab={tab} onUrlChange={(u) => onUrl(tab.id, u)} />
        ) : tab.type === 'code' ? (
          <CodePane folder={root} />
        ) : (
          <FileView doc={doc} onEdit={(v) => onEdit(tab.path, v)} onSave={() => onSave(tab.path)} />
        )}
      </div>

      {tab?.type === 'file' && doc && (
        <div className="ws-status">
          <span className="mono">{tab.path}</span>
          <div className="spacer" />
          {doc.file?.size != null && <span className="mono dim">{kb(doc.file.size)}</span>}
          <span className={doc.dirty ? 'unsaved' : 'dim'}>{doc.dirty ? 'sin guardar' : 'guardado'}</span>
        </div>
      )}
    </section>
  )
}

function FileView({ doc, onEdit, onSave }) {
  if (!doc) return <div className="ws-blank dim">Cargando…</div>
  const { file, content, mode } = doc

  if (file.editable) {
    if (content == null) return <div className="ws-blank dim">Cargando…</div>
    const showEditor = file.kind !== 'markdown' || mode !== 'read'
    const showPreview = file.kind === 'markdown' && mode !== 'edit'
    return (
      <div className="ws-editor">
        {showEditor && (
          <div className="ws-editor-col">
            <Editor key={file.path} value={content} ext={file.ext} onChange={onEdit} onSave={onSave} wrap={file.kind !== 'code'} />
          </div>
        )}
        {showPreview && <div className="preview ws-editor-col" dangerouslySetInnerHTML={{ __html: marked.parse(content || '') }} />}
      </div>
    )
  }

  const src = api.raw(file.path)
  if (file.kind === 'pdf') return <iframe className="ws-frame" title={file.name} src={src} />
  if (file.kind === 'image') return <div className="ws-media"><img alt={file.name} src={src} /></div>
  if (file.kind === 'video') return <div className="ws-media"><video src={src} controls /></div>
  if (file.kind === 'audio') return <div className="ws-media"><audio src={src} controls /></div>

  return (
    <div className="ws-blank">
      <div className="display">{file.ext || 'Archivo'} no se puede mostrar aquí</div>
      <p className="dim" style={{ maxWidth: '40ch' }}>
        Word, Excel y PowerPoint necesitan su propio programa: renderizarlos aquí significaría
        convertirlos y perder el formato.
      </p>
      <button className="btn primary" onClick={() => api.openPath(file.path)}>
        <Icon name="external" size={13} /> Abrir con el programa del sistema
      </button>
    </div>
  )
}
