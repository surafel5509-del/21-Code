import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { marked } from 'marked'
import { Check, ChevronDown, ExternalLink, FileWarning, Monitor, RefreshCw, Smartphone, Tablet, X, Image as ImageIcon } from 'lucide-react'
import type { ConsoleMessage, Diagnostic, Project, ProjectFile, Settings } from '../../types'
import { base64ToBytes, extension, mimeFor } from '../../services/filesystem'
import { buildPreview, openPreviewTab, revokePreview, type PreviewBuild } from '../../services/preview'
import { IconButton } from '../layout/Common'

interface Props {
  project: Project
  activeFile: ProjectFile | null
  settings: Settings
  onEntryChange: (path: string) => void
  onDiagnostics: (diagnostics: Diagnostic[]) => void
  onMessage: (message: ConsoleMessage) => void
  onClose: () => void
  toast: (message: string) => void
}
type Device = 'desktop' | 'tablet' | 'mobile'
export function PreviewPanel({ project, activeFile, settings, onEntryChange, onDiagnostics, onMessage, onClose, toast }: Props) {
  const [snapshot, setSnapshot] = useState(project)
  const [refresh, setRefresh] = useState(0)
  const [build, setBuild] = useState<PreviewBuild | null>(null)
  const [error, setError] = useState('')
  const [device, setDevice] = useState<Device>('desktop')
  const [mode, setMode] = useState<'website' | 'file'>('website')
  const [frameStatus, setFrameStatus] = useState<'building' | 'ready'>('building')
  const [assetUrl, setAssetUrl] = useState('')
  const [assetError, setAssetError] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 400, height: 600 })
  const frameRef = useRef<HTMLIFrameElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const buildRef = useRef<PreviewBuild | null>(null)
  const projectRef = useRef(project)
  const onMessageRef = useRef(onMessage)
  projectRef.current = project; onMessageRef.current = onMessage
  const htmlFiles = project.files.filter(file => file.kind === 'file' && !file.binary && ['html','htm'].includes(extension(file.path)))
  const fileCanPreview = !!activeFile && (['md','markdown','svg','png','jpg','jpeg','gif','webp','avif'].includes(extension(activeFile.path)))

  useEffect(() => { setSnapshot(projectRef.current); setMode('website') }, [project.id, refresh])
  useEffect(() => {
    if (!settings.autoPreview) return
    const timer = setTimeout(() => setSnapshot(projectRef.current), settings.previewDebounceMs)
    return () => clearTimeout(timer)
  }, [project.files, project.entryFile, project.id, settings.autoPreview, settings.previewDebounceMs])

  useEffect(() => {
    let next: PreviewBuild | null = null
    setFrameStatus('building')
    try {
      next = buildPreview(snapshot, snapshot.entryFile)
      buildRef.current = next; setBuild(next); setError(''); onDiagnostics(next.diagnostics)
    } catch (caught) {
      buildRef.current = null; setBuild(null); onDiagnostics([])
      setError(caught instanceof Error ? caught.message : 'Could not build the preview.')
    }
    return () => { revokePreview(next) }
    // onDiagnostics is a stable state setter; rebuilding is driven by the debounced snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot])

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const current = buildRef.current
      if (!current || event.source !== frameRef.current?.contentWindow || !event.data || event.data.__twentyOne !== current.nonce) return
      const { level, message, source, line } = event.data as { level: string; message: string; source?: string; line?: number }
      if (level === 'ready') { setFrameStatus('ready'); return }
      if (!['log','info','warn','error'].includes(level) || typeof message !== 'string') return
      onMessageRef.current({ id: crypto.randomUUID(), level: level as ConsoleMessage['level'], message: message.slice(0, 4000), source: typeof source === 'string' ? source.slice(0, 1024) : undefined, line: typeof line === 'number' ? line : undefined, time: Date.now() })
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [])

  useEffect(() => {
    const element = canvasRef.current
    if (!element) return
    const update = () => setCanvasSize({ width: element.clientWidth, height: element.clientHeight })
    update()
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', update); return () => window.removeEventListener('resize', update) }
    const observer = new ResizeObserver(update); observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setAssetError(false)
    if (!activeFile || !fileCanPreview || ['md','markdown'].includes(extension(activeFile.path))) { setAssetUrl(''); return }
    const url = URL.createObjectURL(new Blob([activeFile.binary ? base64ToBytes(activeFile.content) as BlobPart : activeFile.content], { type: mimeFor(activeFile.path) }))
    setAssetUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [activeFile, fileCanPreview])

  const widths: Record<Device, number> = { desktop: 960, tablet: 768, mobile: 375 }
  const target = widths[device]
  const availableWidth = Math.max(100, canvasSize.width - 32)
  const scale = Math.min(1, availableWidth / target)
  const markdownDoc = activeFile && ['md','markdown'].includes(extension(activeFile.path)) ? `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:"><style>body{max-width:780px;margin:40px auto;padding:0 24px;font:16px/1.7 system-ui;color:#26383e}pre,code{background:#eef3f3;border-radius:4px;padding:2px 5px}pre{padding:16px;overflow:auto}img{max-width:100%}a{color:#18776e}</style>${marked.parse(activeFile.content, { async: false })}` : ''

  return <div className="preview-panel">
    <div className="preview-heading"><div className="preview-heading-label"><span className="preview-status-dot" /><span>LIVE PREVIEW</span><span className="live-badge">{error ? 'ERROR' : frameStatus === 'ready' ? 'LIVE' : 'BUILDING'}</span></div><div className="preview-heading-actions">
      {!Capacitor.isNativePlatform() && <IconButton label="Open preview in new tab" onClick={() => { try { openPreviewTab(project, project.entryFile); toast('If pop-ups are allowed, the preview will open in a new tab.') } catch (caught) { toast(caught instanceof Error ? caught.message : 'Unable to open preview.') } }}><ExternalLink size={15} /></IconButton>}
      <IconButton label="Refresh preview" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} /></IconButton>
      <IconButton label="Close preview" onClick={onClose}><X size={16} /></IconButton>
    </div></div>
    <div className="preview-toolbar"><div className="preview-mode">
      <button className={mode === 'website' ? 'active' : ''} onClick={() => setMode('website')}>Website</button>
      {fileCanPreview && <button className={mode === 'file' ? 'active' : ''} onClick={() => setMode('file')}>Current file</button>}
    </div><div className="device-buttons" aria-label="Preview viewport">
      <IconButton label="Desktop viewport" pressed={device === 'desktop'} className={device === 'desktop' ? 'active' : ''} onClick={() => setDevice('desktop')}><Monitor size={15} /></IconButton>
      <IconButton label="Tablet viewport" pressed={device === 'tablet'} className={device === 'tablet' ? 'active' : ''} onClick={() => setDevice('tablet')}><Tablet size={15} /></IconButton>
      <IconButton label="Mobile viewport" pressed={device === 'mobile'} className={device === 'mobile' ? 'active' : ''} onClick={() => setDevice('mobile')}><Smartphone size={15} /></IconButton>
    </div></div>
    {mode === 'website' && <div className="preview-address"><span className="address-dot" /><span>project://</span><label className="entry-select"><select aria-label="Preview HTML entry file" value={project.entryFile} onChange={event => onEntryChange(event.target.value)}>{!htmlFiles.some(file => file.path === project.entryFile) && <option value={project.entryFile}>{project.entryFile}</option>}{htmlFiles.map(file => <option value={file.path} key={file.id}>{file.path}</option>)}</select><ChevronDown size={12} /></label><span className="address-secure"><Check size={12} /> isolated</span></div>}
    <div className="preview-canvas" ref={canvasRef}>
      {mode === 'website' ? error ? <div className="preview-error"><div className="preview-error-icon"><FileWarning size={24} /></div><h3>Nothing to preview yet</h3><p>{error}</p><button className="secondary-button" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} /> Try again</button></div> : <div className="viewport-frame" style={{ width: target * scale, height: Math.max(120, canvasSize.height - 32) }}><iframe ref={frameRef} title="Sandboxed live preview" sandbox="allow-scripts" srcDoc={build?.html ?? ''} onLoad={() => { /* bridge confirms readiness */ }} style={{ width: target, height: `${100 / scale}%`, transform: `scale(${scale})` }} /></div>
      : activeFile && markdownDoc ? <div className="file-preview-frame"><iframe title="Markdown preview" sandbox="" srcDoc={markdownDoc} /></div>
      : activeFile && assetUrl ? <div className="asset-preview">{assetError ? <div className="preview-error"><ImageIcon size={28} /><p>This image could not be decoded.</p></div> : <img src={assetUrl} alt={`Preview of ${activeFile.path}`} onError={() => setAssetError(true)} />}<span>{activeFile.path}</span></div>
      : <div className="preview-error"><ImageIcon size={28} /><p>Select a Markdown or image file to preview it.</p></div>}
    </div>
    <div className="preview-footer"><span><span className="preview-status-dot" /> {settings.autoPreview ? 'Auto-refresh on' : 'Auto-refresh off'}</span><span>{mode === 'website' ? `${target}px viewport` : 'File preview'}</span></div>
  </div>
}
