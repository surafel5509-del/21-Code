import { useEffect, useState } from 'react'
import { Command, CornerDownLeft, Search } from 'lucide-react'

export interface PaletteAction { id: string; label: string; detail?: string; shortcut?: string; run: () => void }
export function CommandPalette({ actions, onClose }: { actions: PaletteAction[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const filtered = actions.filter(action => `${action.label} ${action.detail ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  useEffect(() => setIndex(0), [query])
  return <div className="palette-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette"><div className="palette-search"><Search size={19} /><input autoFocus placeholder="Type a command..." aria-label="Search commands" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') onClose(); if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(current => Math.min(filtered.length - 1, current + 1)) } if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(current => Math.max(0, current - 1)) } if (event.key === 'Enter' && filtered[index]) { filtered[index].run(); onClose() } }} /><kbd>ESC</kbd></div><div className="palette-list"><div className="palette-caption">COMMANDS</div>{filtered.length ? filtered.map((action, i) => <button key={action.id} className={i === index ? 'selected' : ''} onMouseEnter={() => setIndex(i)} onClick={() => { action.run(); onClose() }}><Command size={15} /><span>{action.label}<small>{action.detail}</small></span>{action.shortcut && <kbd>{action.shortcut}</kbd>}{i === index && <CornerDownLeft size={14} />}</button>) : <p>No commands found.</p>}</div><div className="palette-footer">↑ ↓ to navigate <span>↵ to select</span></div></div></div>
}
