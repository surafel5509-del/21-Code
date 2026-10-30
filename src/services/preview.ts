import { parse, parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5'
import type { Diagnostic, Project } from '../types'
import { bytesToBase64, dirname, extension, mimeFor } from './filesystem'

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']

/** Resolve local references without allowing a path to escape the project. */
export function resolveProjectPath(basePath: string, reference: string): string | null {
  const value = reference.trim()
  if (!value || value.startsWith('#') || value.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(value)) return null
  const clean = value.split(/[?#]/, 1)[0]
  if (!clean) return null
  let decoded: string
  try { decoded = decodeURIComponent(clean) } catch { return null }
  if (decoded.includes('\\') || /[\x00-\x1f]/.test(decoded)) return null
  const parts = decoded.startsWith('/') ? [] : dirname(basePath).split('/').filter(Boolean)
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { if (!parts.length) return null; parts.pop() }
    else parts.push(part)
  }
  return parts.length ? parts.join('/') : null
}

export interface PreviewBuild { html: string; urls: string[]; diagnostics: Diagnostic[]; nonce: string }
export function missingEntry(project: Project, entryPath: string): string | null {
  const file = project.files.find(item => item.kind === 'file' && item.path === entryPath)
  if (!file) return `“${entryPath || 'index.html'}” was not found in this project. Select an HTML file or create one to start the preview.`
  if (file.binary || !['html','htm'].includes(extension(file.path))) return 'The preview entry must be a text HTML file.'
  return null
}

function dataUrl(mime: string, content: string, binary = false): string {
  const encoded = binary ? content : bytesToBase64(new TextEncoder().encode(content))
  return `data:${mime};base64,${encoded}`
}
function isExternal(ref: string): boolean { return /^(?:https?:)?\/\//i.test(ref) || /^(?:javascript|file):/i.test(ref) }

/** Build the document without injecting any user content into the application's DOM. */
export function buildPreview(project: Project, entryPath: string): PreviewBuild {
  const error = missingEntry(project, entryPath)
  if (error) throw new Error(error)
  const entry = project.files.find(file => file.path === entryPath)!
  const files = new Map(project.files.filter(file => file.kind === 'file').map(file => [file.path, file]))
  const urls: string[] = []
  const resourceUrls = new Map<string, string>()
  const diagnostics: Diagnostic[] = []
  const nonce = crypto.randomUUID()
  const warning = (message: string, path: string) => {
    if (!diagnostics.some(item => item.message === message && item.path === path)) diagnostics.push({ id: crypto.randomUUID(), severity: 'warning', message, path })
  }
  // Generate ordinary assets first; CSS is generated separately after its URLs are rewritten.
  for (const file of files.values()) {
    if (['css','html','htm'].includes(extension(file.path))) continue
    const content = ['js','mjs','cjs'].includes(extension(file.path)) && !file.binary
      ? `${file.content}\n//# sourceURL=project:///${encodeURI(file.path)}\n`
      : file.content
    resourceUrls.set(file.path, dataUrl(mimeFor(file.path), content, file.binary))
  }
  const building = new Set<string>()
  const getUrl = (base: string, ref: string): string => {
    const trimmed = ref.trim()
    if (!trimmed || trimmed.startsWith('#') || /^(data|blob):/i.test(trimmed)) return trimmed
    if (isExternal(trimmed)) { warning(`External resource blocked by the preview sandbox: ${trimmed}`, base); return 'data:,' }
    const target = resolveProjectPath(base, trimmed)
    if (!target || !files.has(target)) { warning(`Missing resource: ${trimmed}`, base); return 'data:,' }
    if (extension(target) === 'css') return cssUrl(target)
    const url = resourceUrls.get(target)
    if (!url) { warning(`Resource cannot be loaded in preview: ${trimmed}`, base); return 'data:,' }
    return url
  }
  const rewriteCss = (css: string, path: string): string => css
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_whole, quote: string, ref: string) => `url(${quote || '"'}${getUrl(path, ref)}${quote || '"'})`)
    .replace(/(@import\s+)(["'])([^"']+)\2/gi, (_whole, prefix: string, quote: string, ref: string) => `${prefix}${quote}${getUrl(path, ref)}${quote}`)
  const cssUrl = (path: string): string => {
    const existing = resourceUrls.get(path)
    if (existing) return existing
    if (building.has(path)) { warning(`Circular CSS import: ${path}`, path); return 'data:,' }
    const file = files.get(path)
    if (!file || file.binary) return 'data:,'
    building.add(path)
    const url = dataUrl('text/css', rewriteCss(file.content, path))
    resourceUrls.set(path, url); building.delete(path)
    return url
  }
  for (const file of files.values()) if (extension(file.path) === 'css') cssUrl(file.path)
  const doc = parse(entry.content)
  const walk = (node: Node) => {
    if ('tagName' in node) {
      const el = node as Element
      const attributes = new Map(el.attrs.map(attr => [attr.name, attr.value]))
      if (el.tagName === 'base') el.attrs = []
      for (const attr of el.attrs) {
        const tag = el.tagName
        const resource = attr.name === 'src' || attr.name === 'poster' || (attr.name === 'href' && ['link','image','use'].includes(tag))
        if (resource) attr.value = getUrl(entry.path, attr.value)
        else if (attr.name === 'srcset') attr.value = attr.value.split(',').map(item => { const [ref, ...rest] = item.trim().split(/\s+/); return [getUrl(entry.path, ref), ...rest].join(' ') }).join(', ')
        else if (attr.name === 'style') attr.value = rewriteCss(attr.value, entry.path)
      }
      if (el.tagName === 'style' && 'childNodes' in el) for (const child of el.childNodes) if (child.nodeName === '#text' && 'value' in child) child.value = rewriteCss(child.value, entry.path)
      if (el.tagName === 'meta' && attributes.get('http-equiv')?.toLowerCase() === 'refresh') el.attrs = []
    }
    if ('childNodes' in node) for (const child of node.childNodes) walk(child)
  }
  walk(doc)
  const mapJSON = '{}'
  const bridge = `(function(){
    const token=${JSON.stringify(nonce)}, sources=${mapJSON};
    const send=(level,message,source,line)=>{try{parent.postMessage({__twentyOne:token,level,message:String(message).slice(0,4000),source:sources[source]||String(source||'').replace('project:///',''),line:Number(line)||undefined},'*')}catch(_){}};
    const show=x=>{try{return typeof x==='string'?x:JSON.stringify(x)??String(x)}catch(_){return String(x)}};
    ['log','info','warn','error'].forEach(level=>{const original=console[level];console[level]=function(...args){send(level,args.map(show).join(' '));original.apply(console,args)}});
    addEventListener('error',e=>{if(e.target && e.target!==window){send('error','Failed to load resource: '+(e.target.src||e.target.href||e.target.tagName));}else send('error',e.message||'Script error',e.filename,e.lineno)},true);
    addEventListener('unhandledrejection',e=>send('error','Unhandled promise rejection: '+show(e.reason)));
    addEventListener('click',e=>{const a=e.target instanceof Element?e.target.closest('a[href]'):null;if(a && !a.getAttribute('href').startsWith('#')){e.preventDefault();send('warn','Navigation is disabled in the isolated preview.')}} ,true);
    send('ready','Preview connected');
  })();`
  const csp = "default-src 'none'; script-src 'unsafe-inline' blob: data:; style-src 'unsafe-inline' blob: data:; img-src blob: data:; font-src blob: data:; media-src blob: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
  const fragment = parseFragment(`<meta http-equiv="Content-Security-Policy" content="${csp}"><script>${bridge}</script>`)
  const htmlEl = doc.childNodes.find(node => 'tagName' in node && node.tagName === 'html') as Element | undefined
  const head = htmlEl?.childNodes.find(node => 'tagName' in node && node.tagName === 'head') as Element | undefined
  if (head) {
    for (const node of fragment.childNodes) node.parentNode = head
    head.childNodes.unshift(...fragment.childNodes)
  }
  return { html: serialize(doc), urls, diagnostics, nonce }
}

export function revokePreview(build: PreviewBuild | null): void { if (build) for (const url of build.urls) URL.revokeObjectURL(url) }

/** A new tab receives only a trusted wrapper; untrusted project code remains in an opaque sandbox. */
export function openPreviewTab(project: Project, entry: string): boolean {
  const build = buildPreview(project, entry)
  const escaped = build.html.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const wrapper = `<!doctype html><html><head><meta charset="utf-8"><title>21 Code Preview</title><style>html,body,iframe{border:0;margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><iframe title="Isolated project preview" sandbox="allow-scripts" srcdoc="${escaped}"></iframe></body></html>`
  const url = URL.createObjectURL(new Blob([wrapper], { type: 'text/html' }))
  const tab = window.open(url, '_blank', 'noopener,noreferrer')
  // The wrapper is trusted and the project remains in its sandbox. Revoke after the tab loads.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  // noopener may return null even when the tab opened, so do not claim success/failure from its return value.
  void tab
  return true
}
