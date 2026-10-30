import { useState } from 'react'
import { Code2, Download, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import type { Snippet } from '../types'
import { builtinSnippets } from '../services/snippets'
import { IconButton } from '../components/layout/Common'

interface Props { snippets: Snippet[]; onInsert: (snippet: Snippet) => void; onEdit: (snippet?: Snippet) => void; onDelete: (snippet: Snippet) => void; onImport: () => void; onExport: () => void }
export function SnippetsPanel({ snippets, onInsert, onEdit, onDelete, onImport, onExport }: Props) {
  const [query, setQuery] = useState('')
  const all = [...builtinSnippets, ...snippets].filter(snippet => `${snippet.name} ${snippet.category} ${snippet.description}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="snippets-panel"><div className="sidebar-title"><span>SNIPPETS</span><div className="sidebar-actions"><IconButton label="Import snippets" onClick={onImport}><Upload size={15} /></IconButton><IconButton label="Export snippets" onClick={onExport}><Download size={15} /></IconButton><IconButton label="Create snippet" onClick={() => onEdit()}><Plus size={16} /></IconButton></div></div><div className="search-fields"><div className="search-input-wrap"><Search size={15} /><input aria-label="Search snippets" placeholder="Search snippets" value={query} onChange={event => setQuery(event.target.value)} /></div></div><p className="panel-hint">Insert a reusable piece of code at the cursor.</p><div className="snippets-list">{all.map(snippet => <div className="snippet-row" key={snippet.id}><button className="snippet-main" onClick={() => onInsert(snippet)}><span className="snippet-icon"><Code2 size={15} /></span><span><strong>{snippet.name}</strong><small>{snippet.category} · {snippet.description}</small></span></button>{!snippet.builtin && <div className="snippet-actions"><IconButton label={`Edit ${snippet.name}`} onClick={() => onEdit(snippet)}><Pencil size={13} /></IconButton><IconButton label={`Delete ${snippet.name}`} onClick={() => onDelete(snippet)}><Trash2 size={13} /></IconButton></div>}</div>)}</div></div>
}
