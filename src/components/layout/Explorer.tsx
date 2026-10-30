import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FilePlus2, FolderPlus, MoreHorizontal, Search, X, FolderOpen, Upload, ArrowUpDown, PanelLeftClose, ArrowRight, Plus } from 'lucide-react'
import type { Project, ProjectFile, Settings } from '../../types'
import { basename, dirname, extension } from '../../services/filesystem'
import { EmptyState, FileIcon, IconButton } from './Common'

export type FileAction = 'newFile' | 'newFolder' | 'rename' | 'move' | 'duplicate' | 'delete' | 'download' | 'import'
interface Props {
  project: Project
  dirtyIds: Set<string>
  settings: Settings
  onOpen: (file: ProjectFile) => void
  onAction: (action: FileAction, file?: ProjectFile) => void
  onSort: () => void
  onClose: () => void
  onNewProject: () => void
  onProjects: () => void
  onImportZip: () => void
}
export function Explorer({ project, dirtyIds, settings, onOpen, onAction, onSort, onClose, onNewProject, onProjects, onImportZip }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [rootOpen, setRootOpen] = useState(true)
  const [openEditors, setOpenEditors] = useState(true)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [menu, setMenu] = useState<{ file: ProjectFile; x: number; y: number } | null>(null)
  const children = useMemo(() => {
    const groups = new Map<string, ProjectFile[]>()
    for (const file of project.files) {
      const parent = dirname(file.path)
      groups.set(parent, [...(groups.get(parent) ?? []), file])
    }
    for (const list of groups.values()) list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
      if (settings.explorerSort === 'type' && a.kind === 'file') { const diff = extension(a.path).localeCompare(extension(b.path)); if (diff) return diff }
      return basename(a.path).localeCompare(basename(b.path), undefined, { sensitivity: 'base' })
    })
    return groups
  }, [project.files, settings.explorerSort])
  const toggle = (id: string) => setExpanded(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })
  const showMenu = (event: React.MouseEvent, file: ProjectFile) => { event.preventDefault(); event.stopPropagation(); setMenu({ file, x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 260) }) }
  const renderTree = (parent: string, depth = 0): React.ReactNode => (children.get(parent) ?? []).filter(file => !filter || file.path.toLowerCase().includes(filter.toLowerCase()) || (file.kind === 'folder' && project.files.some(child => child.path.startsWith(`${file.path}/`) && child.path.toLowerCase().includes(filter.toLowerCase())))).map(file => {
    const folder = file.kind === 'folder', open = expanded.has(file.id) || !!filter
    return <div key={file.id}>
      <div className={`tree-row ${project.activeFileId === file.id ? 'selected' : ''}`} style={{ paddingLeft: `${12 + depth * 16}px` }} onContextMenu={event => showMenu(event, file)}>
        <button className="tree-main" onClick={() => folder ? toggle(file.id) : onOpen(file)} title={file.path}>
          {folder ? (open ? <ChevronDown size={14} className="tree-chevron" /> : <ChevronRight size={14} className="tree-chevron" />) : <span className="tree-chevron-spacer" />}
          <FileIcon path={file.path} folder={folder} open={open} /><span className="tree-name">{basename(file.path)}</span>{dirtyIds.has(file.id) && <span className="dirty-dot" title="Unsaved changes" />}
        </button>
        <button className="tree-more" aria-label={`Actions for ${file.path}`} title="File actions" onClick={event => showMenu(event, file)}><MoreHorizontal size={15} /></button>
      </div>
      {folder && open && renderTree(file.path, depth + 1)}
    </div>
  })
  return <div className="explorer-content">
    <div className="sidebar-title"><span>EXPLORER</span><div className="sidebar-actions">
      <IconButton label="Search files by name" onClick={() => setFilterOpen(!filterOpen)}><Search size={15} /></IconButton>
      <IconButton label="New file" onClick={() => onAction('newFile')}><FilePlus2 size={16} /></IconButton>
      <IconButton label="New folder" onClick={() => onAction('newFolder')}><FolderPlus size={16} /></IconButton>
      <IconButton label="Close explorer" className="mobile-only" onClick={onClose}><PanelLeftClose size={16} /></IconButton>
    </div></div>
    {filterOpen && <div className="file-filter"><Search size={14} /><input aria-label="Filter files" autoFocus value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter files..." /><button onClick={() => { setFilter(''); setFilterOpen(false) }} aria-label="Close file filter"><X size={14} /></button></div>}
    <div className="explorer-scroll">
      <button className="section-label" onClick={() => setOpenEditors(!openEditors)}>{openEditors ? <ChevronDown size={14} /> : <ChevronRight size={14} />} <span>OPEN EDITORS</span><span className="section-count">{project.openTabs.length}</span></button>
      {openEditors && <div className="open-editors">{project.openTabs.map(fileId => {
        const file = project.files.find(item => item.id === fileId)
        if (!file) return null
        return <button key={file.id} className={`open-editor ${project.activeFileId === file.id ? 'active' : ''}`} onClick={() => onOpen(file)}><FileIcon path={file.path} /><span>{basename(file.path)}</span>{dirtyIds.has(file.id) && <span className="dirty-dot" />}</button>
      })}</div>}
      <button className="section-label project-section" onClick={() => setRootOpen(!rootOpen)}>{rootOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} <span>{project.name.toUpperCase()}</span><span className="section-count">{project.files.filter(file => file.kind === 'file').length}</span></button>
      {rootOpen && <div className="file-tree">{project.files.length ? renderTree('') : <EmptyState icon={<FolderOpen size={21} />} title="Your project is empty">Create a file to get started.</EmptyState>}</div>}
      <div className="explorer-inline-actions"><button onClick={() => onAction('import')}><Upload size={13} /> Import files</button><button onClick={onSort} title={`Sort by ${settings.explorerSort === 'name' ? 'type' : 'name'}`}><ArrowUpDown size={13} /> Sort</button></div>
      <div className="quick-start-card"><div className="quick-start-heading"><span><i /> MAKE IT YOURS</span><button title="Open recent projects and examples" onClick={onProjects}><ArrowRight size={14} /></button></div><p>A fresh space for your next idea.</p><button className="quick-start-primary" onClick={onNewProject}><Plus size={13} /> Create project</button><div className="quick-start-links"><button onClick={onImportZip}>Import ZIP</button><button onClick={onProjects}>Recent & examples</button></div></div>
    </div>
    <div className="explorer-footer"><div className="local-icon"><FolderOpen size={15} /></div><div><strong>LOCAL WORKSPACE</strong><span>Stored on this device</span></div><span className="local-indicator" /></div>
    {menu && <><div className="context-backdrop" onClick={() => setMenu(null)} onContextMenu={event => { event.preventDefault(); setMenu(null) }} /><div className="context-menu" style={{ left: menu.x, top: menu.y }} role="menu">
      {menu.file.kind === 'folder' && <><button role="menuitem" onClick={() => { onAction('newFile', menu.file); setMenu(null) }}>New file here</button><button role="menuitem" onClick={() => { onAction('newFolder', menu.file); setMenu(null) }}>New folder here</button><div className="menu-separator" /></>}
      {(['rename','move', ...(menu.file.kind === 'file' ? ['duplicate','download'] : []), 'delete'] as FileAction[]).map(action => <button role="menuitem" className={action === 'delete' ? 'danger-text' : ''} key={action} onClick={() => { onAction(action, menu.file); setMenu(null) }}>{action === 'download' ? 'Download file' : action[0].toUpperCase() + action.slice(1)}</button>)}
    </div></>}
  </div>
}
