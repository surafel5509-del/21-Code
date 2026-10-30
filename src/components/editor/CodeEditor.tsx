import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { EditorState, Compartment, EditorSelection, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, keymap, rectangularSelection, crosshairCursor } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, indentMore, indentLess, selectLine, copyLineDown as duplicateLine, deleteLine, moveLineUp, moveLineDown, toggleComment, selectAll, cursorCharLeft, cursorCharRight, cursorLineUp, cursorLineDown } from '@codemirror/commands'
import { closeBrackets, closeBracketsKeymap, autocompletion } from '@codemirror/autocomplete'
import { bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting, HighlightStyle, matchBrackets } from '@codemirror/language'
import { searchKeymap, highlightSelectionMatches, openSearchPanel } from '@codemirror/search'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { tags } from '@lezer/highlight'
import type { ProjectFile, Settings } from '../../types'
import { extension } from '../../services/filesystem'

export type EditorCommand = 'undo' | 'redo' | 'search' | 'indent' | 'outdent' | 'selectLine' | 'duplicateLine' | 'deleteLine' | 'moveLineUp' | 'moveLineDown' | 'comment' | 'selectAll' | 'left' | 'right' | 'up' | 'down' | 'matchingBracket' | 'copy' | 'cut' | 'paste'
export interface EditorHandle {
  command(command: EditorCommand): Promise<boolean>
  insert(text: string, pair?: boolean): void
  goto(from: number, to?: number): void
  gotoLine(line: number, column: number): void
  focus(): void
  getSelection(): string
}
interface Props {
  file: ProjectFile | null
  settings: Settings
  dark: boolean
  maxBytes: number
  onChange: (id: string, content: string) => void
  onCursor: (line: number, column: number, selected: number) => void
  onError: (message: string) => void
}

function languageFor(path: string): Extension {
  switch (extension(path)) {
    case 'html': case 'htm': return html()
    case 'css': return css()
    case 'js': case 'mjs': case 'cjs': return javascript()
    case 'jsx': return javascript({ jsx: true })
    case 'ts': return javascript({ typescript: true })
    case 'tsx': return javascript({ typescript: true, jsx: true })
    case 'json': return json()
    case 'md': case 'markdown': return markdown()
    case 'xml': case 'svg': return xml()
    case 'yml': case 'yaml': return yaml()
    default: return []
  }
}
const darkHighlight = HighlightStyle.define([
  { tag: tags.comment, color: '#647486', fontStyle: 'italic' },
  { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: '#d5ddec' },
  { tag: [tags.propertyName, tags.attributeName], color: '#86baf6' },
  { tag: [tags.variableName, tags.labelName], color: '#d5ddec' },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#e4be83' },
  { tag: [tags.definition(tags.name), tags.separator], color: '#d5ddec' },
  { tag: [tags.brace, tags.paren, tags.squareBracket], color: '#a9b7ca' },
  { tag: [tags.annotation, tags.number, tags.changed, tags.bool, tags.null], color: '#d5adf4' },
  { tag: [tags.typeName, tags.className], color: '#e9bb83' },
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: '#c792ea' },
  { tag: [tags.tagName], color: '#fb8799' },
  { tag: [tags.string, tags.special(tags.string)], color: '#a8d6a0' },
  { tag: [tags.operator, tags.punctuation], color: '#93a4bb' },
  { tag: [tags.meta, tags.processingInstruction], color: '#e6bb85' },
  { tag: tags.heading, color: '#6ad7de', fontWeight: 'bold' },
  { tag: tags.link, color: '#8fb9f4', textDecoration: 'underline' },
])
function themeFor(settings: Settings, dark: boolean): Extension {
  const font = settings.fontFamily === 'mono' ? '"JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace' : settings.fontFamily === 'serif' ? 'Georgia, serif' : 'system-ui, sans-serif'
  return [
    EditorView.theme({
      '&': { height: '100%', backgroundColor: dark ? '#0d141e' : '#fbfcfd', color: dark ? '#cbd6e5' : '#24384b', fontSize: `${settings.fontSize}px`, fontFamily: font },
      '.cm-scroller': { overflow: 'auto', lineHeight: String(settings.lineHeight), fontFamily: font },
      '.cm-content': { padding: '20px 0 80px', caretColor: dark ? '#69d7e1' : '#087b85', minWidth: '100%' },
      '.cm-line': { padding: '0 16px 0 10px' },
      '.cm-gutters': { backgroundColor: dark ? '#0d141e' : '#fbfcfd', color: dark ? '#526275' : '#9ba9b5', border: 'none', padding: '0 8px 0 12px' },
      '.cm-lineNumbers .cm-gutterElement': { minWidth: '30px', padding: '0 8px 0 0' },
      '.cm-activeLine': { backgroundColor: dark ? '#18243280' : '#e7f2f7' },
      '.cm-activeLineGutter': { color: dark ? '#a8bacb' : '#476674', backgroundColor: 'transparent' },
      '.cm-foldGutter': { width: '14px', color: dark ? '#526275' : '#8a9aa8' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: dark ? '#71dce5' : '#087b85', borderLeftWidth: '2px' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: dark ? '#2d536780 !important' : '#b7dce8 !important' },
      '.cm-matchingBracket': { backgroundColor: dark ? '#395462 !important' : '#cce9eb !important', outline: 'none' },
      '.cm-searchMatch': { backgroundColor: dark ? '#b087345c' : '#f5d882' },
      '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: dark ? '#a7803c' : '#e6b83c' },
      '.cm-panels': { backgroundColor: dark ? '#182330' : '#edf3f5', color: dark ? '#d7e4eb' : '#20333d' },
      '.cm-textfield': { backgroundColor: dark ? '#0d141e' : '#fff', color: 'inherit', border: `1px solid ${dark ? '#344758' : '#bacbd1'}`, borderRadius: '4px', padding: '4px' },
      '.cm-button': { backgroundImage: 'none', backgroundColor: dark ? '#263849' : '#dce8ed', color: 'inherit', border: '0', borderRadius: '4px' },
      '&.cm-focused': { outline: 'none' },
    }, { dark }),
    syntaxHighlighting(dark ? darkHighlight : defaultHighlightStyle),
    EditorState.tabSize.of(settings.tabSize), indentUnit.of(' '.repeat(settings.tabSize)),
    ...(settings.wordWrap ? [EditorView.lineWrapping] : []),
  ]
}

export const CodeEditor = forwardRef<EditorHandle, Props>(function CodeEditor({ file, settings, dark, maxBytes, onChange, onCursor, onError }, ref) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const activeRef = useRef<ProjectFile | null>(file)
  const callbacks = useRef({ onChange, onCursor, onError })
  callbacks.current = { onChange, onCursor, onError }
  const states = useRef(new Map<string, { state: EditorState; scrollTop: number; scrollLeft: number }>())
  const langComp = useRef(new Compartment()).current
  const themeComp = useRef(new Compartment()).current
  const configRef = useRef({ settings, dark, maxBytes })
  configRef.current = { settings, dark, maxBytes }

  const makeState = (current: ProjectFile | null) => EditorState.create({
    doc: current && !current.binary ? current.content : '',
    extensions: [
      lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), foldGutter(), drawSelection(), dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      EditorState.transactionFilter.of(transaction => {
        if (!transaction.docChanged) return transaction
        const limit = Math.max(0, configRef.current.maxBytes), length = transaction.newDoc.length
        if (length > limit || (length > limit / 3 && new TextEncoder().encode(transaction.newDoc.toString()).length > limit)) {
          queueMicrotask(() => callbacks.current.onError('Edit rejected: the file or project would exceed its storage size limit.'))
          return []
        }
        return transaction
      }),
      indentOnInput(), bracketMatching(), closeBrackets(), autocompletion(),
      rectangularSelection(), crosshairCursor(), highlightActiveLine(), highlightSelectionMatches(),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap, indentWithTab]),
      langComp.of(current ? languageFor(current.path) : []), themeComp.of(themeFor(configRef.current.settings, configRef.current.dark)),
      EditorView.updateListener.of(update => {
        const active = activeRef.current
        if (!active || active.binary) return
        if (update.docChanged) callbacks.current.onChange(active.id, update.state.doc.toString())
        if (update.selectionSet || update.docChanged) {
          const selection = update.state.selection.main
          const line = update.state.doc.lineAt(selection.head)
          callbacks.current.onCursor(line.number, selection.head - line.from + 1, Math.abs(selection.to - selection.from))
        }
      }),
      EditorView.contentAttributes.of({ 'aria-label': 'Code editor', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off' }),
    ],
  })

  useLayoutEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({ state: makeState(file), parent: hostRef.current })
    viewRef.current = view
    return () => { view.destroy(); viewRef.current = null }
    // The view and its per-file state map survive renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    const view = viewRef.current
    if (!view) return
    const previous = activeRef.current
    if (previous?.id !== file?.id) {
      if (previous && !previous.binary) states.current.set(previous.id, { state: view.state, scrollTop: view.scrollDOM.scrollTop, scrollLeft: view.scrollDOM.scrollLeft })
      activeRef.current = file
      const saved = file ? states.current.get(file.id) : undefined
      let state = saved?.state ?? makeState(file)
      if (file && !file.binary && state.doc.toString() !== file.content) state = state.update({ changes: { from: 0, to: state.doc.length, insert: file.content } }).state
      state = state.update({ effects: [langComp.reconfigure(file ? languageFor(file.path) : []), themeComp.reconfigure(themeFor(settings, dark))] }).state
      view.setState(state)
      if (saved) { view.scrollDOM.scrollTop = saved.scrollTop; view.scrollDOM.scrollLeft = saved.scrollLeft }
      else { view.scrollDOM.scrollTop = 0; view.scrollDOM.scrollLeft = 0 }
      const selection = state.selection.main, line = state.doc.lineAt(selection.head)
      callbacks.current.onCursor(line.number, selection.head - line.from + 1, Math.abs(selection.to - selection.from))
    } else {
      activeRef.current = file
      if (file && !file.binary && view.state.doc.toString() !== file.content) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: file.content } })
      }
    }
    // Only file identity, path, or externally changed content should switch the document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id, file?.path, file?.content, file?.binary])

  useEffect(() => {
    const view = viewRef.current
    if (view) view.dispatch({ effects: themeComp.reconfigure(themeFor(settings, dark)) })
  }, [settings.fontFamily, settings.fontSize, settings.lineHeight, settings.tabSize, settings.wordWrap, dark, themeComp, settings])

  useImperativeHandle(ref, () => ({
    async command(command) {
      const view = viewRef.current
      if (!view || !activeRef.current || activeRef.current.binary) return false
      const commands = { undo, redo, indent: indentMore, outdent: indentLess, selectLine, duplicateLine, deleteLine, moveLineUp, moveLineDown, comment: toggleComment, selectAll, left: cursorCharLeft, right: cursorCharRight, up: cursorLineUp, down: cursorLineDown }
      if (command === 'search') { openSearchPanel(view); view.focus(); return true }
      if (command === 'matchingBracket') {
        const result = matchBrackets(view.state, view.state.selection.main.head, 1) ?? matchBrackets(view.state, view.state.selection.main.head, -1)
        if (result?.end) { view.dispatch({ selection: { anchor: result.end.from }, scrollIntoView: true }); view.focus(); return true }
        callbacks.current.onError('No matching bracket at the cursor.'); return false
      }
      if (command === 'copy' || command === 'cut' || command === 'paste') {
        try {
          if (!navigator.clipboard) throw new Error('Clipboard is unavailable in this browser.')
          if (command === 'paste') {
            const text = await navigator.clipboard.readText()
            view.dispatch(view.state.replaceSelection(text))
          } else {
            const ranges = view.state.selection.ranges
            await navigator.clipboard.writeText(ranges.map(range => view.state.sliceDoc(range.from, range.to)).join('\n'))
            if (command === 'cut') view.dispatch(view.state.replaceSelection(''))
          }
          view.focus(); return true
        } catch (error) { callbacks.current.onError(error instanceof Error ? error.message : 'Clipboard permission was denied.'); return false }
      }
      const run = commands[command as keyof typeof commands]
      const result = run ? run(view) : false
      view.focus(); return result
    },
    insert(text, pair = false) {
      const view = viewRef.current
      if (!view || !activeRef.current || activeRef.current.binary) return
      const transaction = view.state.changeByRange(range => {
        const selected = view.state.sliceDoc(range.from, range.to)
        const insert = pair ? text[0] + selected + text.slice(1) : text
        const anchor = range.from + (pair ? 1 : insert.length)
        return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.range(anchor, anchor + (pair ? selected.length : 0)) }
      })
      view.dispatch(transaction); view.focus()
    },
    goto(from, to = from) {
      const view = viewRef.current
      if (!view) return
      const max = view.state.doc.length
      view.dispatch({ selection: { anchor: Math.min(from, max), head: Math.min(to, max) }, scrollIntoView: true }); view.focus()
    },
    gotoLine(line, column) {
      const view = viewRef.current
      if (!view) return
      const target = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines))
      const pos = Math.min(target.to, target.from + Math.max(0, column - 1))
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true }); view.focus()
    },
    focus() { viewRef.current?.focus() },
    getSelection() { const view = viewRef.current; return view ? view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to) : '' },
  }), [])
  return <div className="editor-host" ref={hostRef} />
})
