import { X, FileCode2, FileJson, FileText, FileImage, FileType2, Folder, FolderOpen, File } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { extension } from '../../services/filesystem'

export function Logo({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="21 Code">
    <span className="brand-mark"><span>2</span><span>1</span><i /></span>
    {!compact && <span className="brand-word">21<span>CODE</span></span>}
  </div>
}
export function FileIcon({ path, folder, open }: { path: string; folder?: boolean; open?: boolean }) {
  if (folder) return open ? <FolderOpen size={16} className="file-icon folder-icon" /> : <Folder size={16} className="file-icon folder-icon" />
  const ext = extension(path)
  if (['html','htm'].includes(ext)) return <span className="file-badge html-badge">5</span>
  if (ext === 'css') return <span className="file-badge css-badge">#</span>
  if (['js','mjs','cjs'].includes(ext)) return <span className="file-badge js-badge">JS</span>
  if (['ts','tsx'].includes(ext)) return <span className="file-badge ts-badge">TS</span>
  if (ext === 'json') return <FileJson size={16} className="file-icon json-icon" />
  if (['md','markdown'].includes(ext)) return <span className="file-badge md-badge">M↓</span>
  if (['svg','png','jpg','jpeg','webp','gif'].includes(ext)) return <FileImage size={16} className="file-icon image-icon" />
  if (['xml','jsx'].includes(ext)) return <FileCode2 size={16} className="file-icon code-icon" />
  if (['yml','yaml'].includes(ext)) return <FileType2 size={16} className="file-icon code-icon" />
  if (ext === 'txt') return <FileText size={16} className="file-icon" />
  return <File size={16} className="file-icon" />
}
export function IconButton({ label, children, onClick, className = '', disabled = false, pressed, title }: { label: string; children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean; pressed?: boolean; title?: string }) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} title={title ?? label} onClick={onClick} disabled={disabled} aria-pressed={pressed}>{children}</button>
}
export function Modal({ title, subtitle, onClose, children, wide = false, className = '' }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  const section = useRef<HTMLElement>(null)
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={section} className={`modal ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); return } if (event.key === 'Tab') { const items = [...(section.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])].filter(item => item.offsetWidth || item.offsetHeight || item.getClientRects().length); if (!items.length) return; if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus() } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus() } } }}>
      <div className="modal-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton></div>
      {children}
    </section>
  </div>
}
export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><strong>{title}</strong><p>{children}</p></div>
}
