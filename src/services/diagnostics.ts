import { cssLanguage } from '@codemirror/lang-css'
import { htmlLanguage } from '@codemirror/lang-html'
import { javascriptLanguage, jsxLanguage, typescriptLanguage, tsxLanguage } from '@codemirror/lang-javascript'
import type { LRParser } from '@lezer/lr'
import type { Diagnostic, Project } from '../types'
import { extension } from './filesystem'
import { missingEntry } from './preview'

/** Local syntax checks are parser observations, not a standards validator or compiler. */
export function localDiagnostics(project: Project): Diagnostic[] {
  const results: Diagnostic[] = []
  const entryError = missingEntry(project, project.entryFile)
  if (entryError) results.push({ id: `entry-${project.id}`, severity: 'error', message: entryError, path: project.entryFile })
  for (const file of project.files) {
    if (file.kind !== 'file' || file.binary || file.content.length > 2_000_000) continue
    const ext = extension(file.path)
    if (ext === 'json') {
      try { JSON.parse(file.content) } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid JSON'
        const position = /position (\d+)/.exec(message)?.[1]
        const line = position ? file.content.slice(0, Number(position)).split('\n').length : undefined
        results.push({ id: `json-${file.id}`, severity: 'error', message: `JSON: ${message}`, path: file.path, line })
      }
    }
    if (['html','htm'].includes(ext)) {
      if (!/<!doctype\s+html/i.test(file.content)) results.push({ id: `doctype-${file.id}`, severity: 'warning', message: 'Local HTML check: missing HTML doctype.', path: file.path, line: 1 })
      if (!/<title[\s>]/i.test(file.content)) results.push({ id: `title-${file.id}`, severity: 'info', message: 'Local HTML check: add a document title.', path: file.path, line: 1 })
    }
    const parser: LRParser | undefined = ['html','htm'].includes(ext) ? htmlLanguage.parser : ext === 'css' ? cssLanguage.parser : ['js','mjs','cjs'].includes(ext) ? javascriptLanguage.parser : ext === 'jsx' ? jsxLanguage.parser : ext === 'ts' ? typescriptLanguage.parser : ext === 'tsx' ? tsxLanguage.parser : undefined
    if (parser) {
      let count = 0
      parser.parse(file.content).iterate({ enter(node) {
        if (node.type.isError && count < 20) {
          const line = file.content.slice(0, node.from).split('\n').length
          results.push({ id: `parse-${file.id}-${node.from}-${count++}`, severity: 'warning', message: `${ext.toUpperCase()} local parser: unexpected or incomplete syntax.`, path: file.path, line })
        }
      } })
    }
  }
  return results
}
