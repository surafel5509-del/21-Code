import { describe, expect, it } from 'vitest'
import { addFile } from '../services/filesystem'
import { createProject } from '../services/templates'
import { buildPreview, missingEntry, resolveProjectPath } from '../services/preview'
import { replaceMatches, searchProject } from '../services/search'
import { localDiagnostics } from '../services/diagnostics'

describe('isolated preview', () => {
  it('resolves relative, root and URL-encoded project paths without escaping root', () => {
    expect(resolveProjectPath('pages/index.html', '../assets/logo%20one.png')).toBe('assets/logo one.png')
    expect(resolveProjectPath('pages/index.html', './styles.css?v=1')).toBe('pages/styles.css')
    expect(resolveProjectPath('pages/index.html', '/assets/logo.png')).toBe('assets/logo.png')
    expect(resolveProjectPath('index.html', '../outside.png')).toBeNull()
    expect(resolveProjectPath('index.html', 'https://example.com/a.css')).toBeNull()
    expect(resolveProjectPath('index.html', '#section')).toBeNull()
  })
  it('embeds project resources as data URLs and reports missing resources', () => {
    let project = createProject('Preview')
    const html = project.files.find(file => file.path === 'index.html')!
    project = { ...project, files: project.files.map(file => file.id === html.id ? { ...file, content: '<!doctype html><html><head><title>Test</title><link rel="stylesheet" href="./styles.css"></head><body><img src="./assets/missing.png"><script src="./script.js"></script></body></html>' } : file) }
    const result = buildPreview(project, 'index.html')
    expect(result.html).toContain('data:text/css;base64,')
    expect(result.html).toContain('data:text/javascript;base64,')
    expect(result.html).toContain('Content-Security-Policy')
    expect(result.diagnostics.some(item => item.message.includes('Missing resource'))).toBe(true)
    expect(result.html).not.toContain('src="./assets/missing.png"')
  })
  it('reports missing entry files and real local parser errors', () => {
    let project = createProject('Preview')
    expect(missingEntry(project, 'missing.html')).toContain('not found')
    expect(() => buildPreview(project, 'missing.html')).toThrow(/not found/)
    project = addFile(project, 'broken.json', '{ invalid }')
    expect(localDiagnostics(project).some(item => item.path === 'broken.json' && item.severity === 'error')).toBe(true)
  })
})

describe('project search and replace', () => {
  it('supports case, whole word, path filters and safe replacements', () => {
    let project = createProject('Search')
    project = addFile(project, 'notes.txt', 'cat Cat catalogue\ncat')
    const results = searchProject(project.files, 'cat', { caseSensitive: false, wholeWord: true, filter: 'notes' })
    expect(results).toHaveLength(3)
    expect(results[2]).toMatchObject({ line: 2, column: 1 })
    expect(searchProject(project.files, 'cat', { caseSensitive: true, wholeWord: true, filter: '.txt' })).toHaveLength(2)
    const updated = replaceMatches(project.files, results, 'dog')
    expect(updated.find(file => file.path === 'notes.txt')?.content).toBe('dog dog catalogue\ndog')
    expect(() => replaceMatches(updated, results, 'again')).toThrow(/changed/i)
  })
})
