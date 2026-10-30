import { useMemo, useState } from 'react'
import { Archive, ArrowDownToLine, ArrowRight, Check, Clock3, Copy, FileCode2, FolderOpen, MoreHorizontal, Pin, Plus, Search, Trash2, Upload, X } from 'lucide-react'
import type { Project } from '../types'
import { templates } from '../services/templates'
import { IconButton, Logo, Modal } from '../components/layout/Common'

interface Props {
  projects: Project[]
  initialCreate?: boolean
  recentLimit: number
  activeId: string | null
  onClose: () => void
  onOpen: (id: string) => void
  onCreate: (name: string, templateId: string) => Promise<void>
  onImport: () => void
  onRename: (project: Project) => void
  onDuplicate: (project: Project) => void
  onPin: (project: Project) => void
  onArchive: (project: Project) => void
  onDelete: (project: Project) => void
}
export function Dashboard({ projects, initialCreate = false, recentLimit, activeId, onClose, onOpen, onCreate, onImport, onRename, onDuplicate, onPin, onArchive, onDelete }: Props) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'name'>('recent')
  const [archived, setArchived] = useState(false)
  const [selected, setSelected] = useState<string | null>(initialCreate ? 'blank' : null)
  const [name, setName] = useState('My Website')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const visible = useMemo(() => projects.filter(project => project.archived === archived && project.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || (sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt)).slice(0, query || archived ? undefined : recentLimit), [projects, archived, query, sort, recentLimit])
  const choose = (id: string) => { setSelected(id); setName(id === 'blank' ? 'My Website' : templates.find(template => template.id === id)?.name ?? 'My Website'); setError('') }
  return <div className="dashboard-overlay" role="dialog" aria-modal="true" aria-label="Projects dashboard" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
    <div className="dashboard-shell">
      <header className="dashboard-top"><Logo /><span className="dashboard-divider" /><span className="dashboard-caption">YOUR WORKSPACE</span><IconButton label="Close projects dashboard" onClick={onClose}><X size={19} /></IconButton></header>
      <div className="dashboard-content">
        <div className="dashboard-intro"><div><div className="overline"><span /> YOUR CREATIVE SPACE</div><h1>Make something great<span>.</span></h1><p>All your projects, right where you left them. Everything stays on this device.</p></div><div className="dashboard-top-actions"><button className="secondary-button" onClick={onImport}><Upload size={16} /> Import ZIP</button><button className="primary-button" onClick={() => choose('blank')}><Plus size={17} /> Create project</button></div></div>
        <section className="dashboard-section"><div className="dashboard-section-head"><div><h2>Recent projects <span>{visible.length}</span></h2><p>Pick up where you left off</p></div><div className="dashboard-filters"><div className="dashboard-search"><Search size={15} /><input aria-label="Search projects" placeholder="Search projects" value={query} onChange={event => setQuery(event.target.value)} /></div><select aria-label="Sort projects" value={sort} onChange={event => setSort(event.target.value as 'recent' | 'name')}><option value="recent">Most recent</option><option value="name">Name</option></select><button className={`small-text-button ${archived ? 'selected' : ''}`} onClick={() => setArchived(!archived)}>{archived ? 'Show active' : 'Archived'}</button></div></div>
          {visible.length ? <div className="project-grid">{visible.map((project, index) => <div className="project-card" key={project.id}>
            <button className="project-card-open" onClick={() => { onOpen(project.id); onClose() }}><div className={`project-card-icon tone-${index % 4}`}><FolderOpen size={22} /></div><div className="project-card-copy"><strong>{project.name} {project.pinned && <Pin size={12} />}</strong><span><Clock3 size={12} /> {project.id === activeId ? 'Currently open' : `Edited ${new Date(project.updatedAt).toLocaleDateString()}`}</span></div><ArrowRight size={16} className="project-card-arrow" /></button>
            <div className="project-meta"><span>{project.files.filter(file => file.kind === 'file').length} files</span><span><i /> LOCAL PROJECT</span></div>
            <div className="project-card-more"><IconButton label={`Actions for ${project.name}`} onClick={() => setMenu(menu === project.id ? null : project.id)}><MoreHorizontal size={17} /></IconButton>{menu === project.id && <div className="project-menu"><button onClick={() => { onPin(project); setMenu(null) }}><Pin size={14} /> {project.pinned ? 'Unpin' : 'Pin'} project</button><button onClick={() => { onRename(project); setMenu(null) }}><FileCode2 size={14} /> Rename</button><button onClick={() => { onDuplicate(project); setMenu(null) }}><Copy size={14} /> Duplicate</button><button onClick={() => { onArchive(project); setMenu(null) }}><Archive size={14} /> {project.archived ? 'Unarchive' : 'Archive'}</button><button className="danger-text" onClick={() => { onDelete(project); setMenu(null) }}><Trash2 size={14} /> Delete</button></div>}</div>
          </div>)}</div> : <div className="dashboard-empty"><FolderOpen size={24} /><strong>{query ? 'No matching projects' : archived ? 'No archived projects' : 'Your projects will appear here'}</strong><span>{query ? 'Try a different search.' : 'Create a project or import a ZIP to get started.'}</span></div>}
        </section>
        <section className="dashboard-section templates-section"><div className="dashboard-section-head"><div><h2>Start with a little inspiration <span className="template-label">EXAMPLE PROJECTS</span></h2><p>Choose a starter and make it your own</p></div><span className="templates-count">{templates.length} templates <ArrowRight size={14} /></span></div>
          <div className="template-grid">{templates.map((template, index) => <button className="template-card" key={template.id} onClick={() => choose(template.id)}><div className={`template-art template-art-${index % 4}`}><span className="template-glyph">{template.icon}</span><div className="template-lines"><i /><i /><i /></div><span className="template-art-number">0{index + 1}</span></div><div className="template-copy"><small>{template.tag}</small><strong>{template.name}</strong><p>{template.description}</p><span>index.html · styles.css · script.js</span></div></button>)}</div>
        </section>
        <div className="dashboard-bottom"><span><i /> Your projects are stored locally. No account needed.</span><button onClick={onImport}><ArrowDownToLine size={14} /> Import an existing project</button></div>
      </div>
    </div>
    {selected && <Modal title="Create a new project" subtitle="A fresh space for your next idea." onClose={() => setSelected(null)}>
      <form className="dialog-body" onSubmit={async event => { event.preventDefault(); setCreating(true); setError(''); try { await onCreate(name, selected); setSelected(null); onClose() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create project.') } finally { setCreating(false) } }}>
        <label className="field-label">PROJECT NAME<input autoFocus value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="My Website" /></label>
        <div className="chosen-template"><span className="chosen-icon">{templates.find(item => item.id === selected)?.icon}</span><div><small>STARTER TEMPLATE</small><strong>{templates.find(item => item.id === selected)?.name}</strong><p>{templates.find(item => item.id === selected)?.description}</p><span><Check size={13} /> index.html, styles.css, script.js + README</span></div></div>
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setSelected(null)}>Cancel</button><button className="primary-button" disabled={creating}>{creating ? 'Creating…' : 'Create project'} <ArrowRight size={15} /></button></div>
      </form>
    </Modal>}
  </div>
}
