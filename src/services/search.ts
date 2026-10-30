import type { ProjectFile } from '../types'
import { byteSize, MAX_FILE_SIZE, MAX_PROJECT_SIZE, projectSize } from './filesystem'

export interface SearchOptions { caseSensitive: boolean; wholeWord: boolean; filter: string }
export interface SearchMatch { fileId: string; path: string; line: number; column: number; from: number; to: number; text: string; preview: string }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
export function searchProject(files: ProjectFile[], query: string, options: SearchOptions): SearchMatch[] {
  if (!query) return []
  const expression = new RegExp(`${options.wholeWord ? '\\b' : ''}${escapeRegExp(query)}${options.wholeWord ? '\\b' : ''}`, options.caseSensitive ? 'g' : 'gi')
  const results: SearchMatch[] = []
  for (const file of files) {
    if (file.kind !== 'file' || file.binary || (options.filter && !file.path.toLowerCase().includes(options.filter.toLowerCase()))) continue
    const lines = file.content.split('\n')
    let offset = 0
    for (let i = 0; i < lines.length; i++) {
      expression.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = expression.exec(lines[i])) !== null) {
        results.push({ fileId: file.id, path: file.path, line: i + 1, column: match.index + 1, from: offset + match.index, to: offset + match.index + match[0].length, text: match[0], preview: lines[i].trim().slice(0, 180) })
        if (results.length >= 5000) return results
      }
      offset += lines[i].length + 1
    }
  }
  return results
}
export function replaceMatches(files: ProjectFile[], matches: SearchMatch[], replacement: string): ProjectFile[] {
  const byFile = new Map<string, SearchMatch[]>()
  for (const match of matches) byFile.set(match.fileId, [...(byFile.get(match.fileId) ?? []), match])
  for (const [id, entries] of byFile) {
    const file = files.find(item => item.id === id)
    if (!file || entries.some(match => file.content.slice(match.from, match.to) !== match.text)) throw new Error('Search results changed. Run the search again before replacing.')
  }
  const updated = files.map(file => {
    const entries = byFile.get(file.id)
    if (!entries) return file
    let content = file.content
    for (const match of [...entries].sort((a, b) => b.from - a.from)) content = content.slice(0, match.from) + replacement + content.slice(match.to)
    return { ...file, content, updatedAt: Date.now() }
  })
  if (updated.some(file => byteSize(file) > MAX_FILE_SIZE) || projectSize(updated) > MAX_PROJECT_SIZE) throw new Error('Replacement would exceed the file or project size limit.')
  return updated
}
