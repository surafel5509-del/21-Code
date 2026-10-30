import { useDeferredValue, useMemo, useState } from 'react'
import { CaseSensitive, ChevronDown, ReplaceAll, Search, WholeWord } from 'lucide-react'
import type { Project } from '../types'
import { searchProject, type SearchMatch } from '../services/search'
import { FileIcon } from '../components/layout/Common'

interface Props { project: Project; onNavigate: (match: SearchMatch) => void; onReplaceAll: (matches: SearchMatch[], replacement: string) => void; onReplaceOne: (match: SearchMatch, replacement: string) => void }
export function SearchPanel({ project, onNavigate, onReplaceAll, onReplaceOne }: Props) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [filter, setFilter] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const deferred = useDeferredValue(query)
  const results = useMemo(() => searchProject(project.files, deferred, { caseSensitive, wholeWord, filter }), [project.files, deferred, caseSensitive, wholeWord, filter])
  const files = new Set(results.map(result => result.fileId)).size
  return <div className="search-panel"><div className="sidebar-title"><span>SEARCH</span></div><div className="search-fields">
    <div className="search-input-wrap"><Search size={15} /><input autoFocus aria-label="Search project" placeholder="Search in project" value={query} onChange={event => setQuery(event.target.value)} /><button className={caseSensitive ? 'active' : ''} title="Match case" aria-label="Match case" aria-pressed={caseSensitive} onClick={() => setCaseSensitive(!caseSensitive)}><CaseSensitive size={16} /></button><button className={wholeWord ? 'active' : ''} title="Match whole word" aria-label="Match whole word" aria-pressed={wholeWord} onClick={() => setWholeWord(!wholeWord)}><WholeWord size={16} /></button></div>
    <button className="search-toggle" onClick={() => setShowReplace(!showReplace)}><ChevronDown size={14} className={showReplace ? '' : 'rotate-left'} /> Replace</button>
    {showReplace && <div className="search-input-wrap"><input aria-label="Replace with" placeholder="Replace with" value={replacement} onChange={event => setReplacement(event.target.value)} /><button title="Replace all matches" aria-label="Replace all matches" disabled={!results.length || query !== deferred} onClick={() => onReplaceAll(results, replacement)}><ReplaceAll size={16} /></button></div>}
    <input className="filter-input" aria-label="Filter search by path or extension" placeholder="Files to include (e.g. .css)" value={filter} onChange={event => setFilter(event.target.value)} />
  </div><div className="search-summary">{deferred ? `${results.length}${results.length === 5000 ? '+' : ''} results in ${files} files` : 'Search across all project files'}</div>
    <div className="search-results">{results.slice(0, 500).map((result, index) => <div key={`${result.fileId}-${result.from}`} className="search-result"><button className="search-result-open" onClick={() => onNavigate(result)}><div><FileIcon path={result.path} /><strong>{result.path}</strong><span>{result.line}:{result.column}</span></div><p>{result.preview || '(empty line)'}</p></button>{showReplace && <button className="replace-one" aria-label={`Replace match in ${result.path} at line ${result.line}`} title="Replace this match" onClick={() => onReplaceOne(result, replacement)}><ReplaceAll size={14} /></button>}{index === 499 && results.length > 500 && <small>Showing the first 500 results</small>}</div>)}</div>
  </div>
}
