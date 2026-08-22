import React, { useEffect, useRef } from 'react'
import { EditorView, keymap, highlightActiveLine, lineNumbers } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { java } from '@codemirror/lang-java'
import { cpp } from '@codemirror/lang-cpp'
import { markdown } from '@codemirror/lang-markdown'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { sql } from '@codemirror/lang-sql'

const LANG = {
  '.js': javascript, '.jsx': () => javascript({ jsx: true }), '.mjs': javascript, '.cjs': javascript,
  '.ts': () => javascript({ typescript: true }), '.tsx': () => javascript({ typescript: true, jsx: true }),
  '.py': python, '.java': java,
  '.c': cpp, '.h': cpp, '.cpp': cpp, '.hpp': cpp, '.cs': cpp,
  '.md': markdown, '.markdown': markdown,
  '.html': html, '.xml': html, '.css': css, '.scss': css,
  '.json': json, '.ipynb': json, '.sql': sql,
}

/** Tema que sigue las variables CSS de la app, así light y dark salen gratis. */
const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13.5px', backgroundColor: 'var(--surface)', color: 'var(--ink)' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.7', overflow: 'auto' },
  '.cm-content': { padding: '18px 0', caretColor: 'var(--accent)' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--ink-3)', border: 'none', paddingRight: '6px' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--surface-2) 60%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink-2)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent)',
  },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--amber) 25%, transparent)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--amber) 30%, transparent)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-panels': { backgroundColor: 'var(--surface-2)', color: 'var(--ink)', borderColor: 'var(--line)' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--surface-2)', color: 'var(--ink-3)', border: 'none' },
})

export default function Editor({ value, ext, onChange, onSave, wrap = true }) {
  const host = useRef(null)
  const view = useRef(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  useEffect(() => { onChangeRef.current = onChange; onSaveRef.current = onSave })

  useEffect(() => {
    if (!host.current) return
    const langFn = LANG[ext]
    const extensions = [
      basicSetup,
      theme,
      keymap.of([
        indentWithTab,
        { key: 'Mod-s', preventDefault: true, run: () => { onSaveRef.current?.(); return true } },
      ]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChangeRef.current?.(u.state.doc.toString())
      }),
    ]
    if (wrap) extensions.push(EditorView.lineWrapping)
    if (langFn) extensions.push(langFn())

    const v = new EditorView({
      state: EditorState.create({ doc: value ?? '', extensions }),
      parent: host.current,
    })
    view.current = v
    return () => { v.destroy(); view.current = null }
    // se reconstruye solo al cambiar de archivo, no en cada tecla
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ext, wrap])

  // sincroniza si el valor cambia desde fuera (recarga del disco)
  useEffect(() => {
    const v = view.current
    if (!v) return
    const cur = v.state.doc.toString()
    if (value != null && value !== cur) {
      v.dispatch({ changes: { from: 0, to: cur.length, insert: value } })
    }
  }, [value])

  return <div ref={host} className="cm-host" />
}
