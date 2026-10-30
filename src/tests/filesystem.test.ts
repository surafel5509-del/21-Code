import { describe, expect, it } from 'vitest'
import { addFile, closeFile, deleteFile, duplicateFile, moveFile, openFile, validatePath } from '../services/filesystem'
import { createProject, templates } from '../services/templates'

describe('project and file management', () => {
  it('creates all nine editable starter templates', () => {
    expect(templates).toHaveLength(9)
    for (const template of templates) {
      const project = createProject('Example', template.id)
      expect(project.files.map(file => file.path)).toEqual(expect.arrayContaining(['index.html', 'styles.css', 'script.js']))
      expect(project.files.find(file => file.path === 'index.html')?.content).toContain('<!DOCTYPE html>')
      expect(project.entryFile).toBe('index.html')
      expect(project.activeFileId).toBe(project.files.find(file => file.path === 'index.html')?.id)
    }
  })
  it('creates nested folders and renames, moves, duplicates and deletes files with stable ids', () => {
    let project = createProject('Example')
    project = addFile(project, 'components/cards/card.html', '<p>hello</p>')
    expect(project.files.find(file => file.path === 'components/cards')?.kind).toBe('folder')
    const file = project.files.find(item => item.path.endsWith('card.html'))!
    project = openFile(project, file.id)
    project = moveFile(project, file.id, 'components/cards/renamed.html')
    expect(project.files.find(item => item.id === file.id)?.path).toBe('components/cards/renamed.html')
    project = moveFile(project, file.id, 'assets/card.html')
    expect(project.activeFileId).toBe(file.id)
    project = duplicateFile(project, file.id, 'assets/card-copy.html')
    expect(project.files.find(item => item.path === 'assets/card-copy.html')?.content).toBe('<p>hello</p>')
    project = closeFile(project, file.id)
    expect(project.openTabs).not.toContain(file.id)
    const assets = project.files.find(item => item.path === 'assets')!
    project = deleteFile(project, assets.id)
    expect(project.files.some(item => item.path.startsWith('assets/'))).toBe(false)
  })
  it('updates entry metadata on folder moves and rejects collisions and unsafe paths', () => {
    let project = createProject('Example')
    const html = project.files.find(file => file.path === 'index.html')!
    project = moveFile(project, html.id, 'pages/index.html')
    const folder = project.files.find(file => file.path === 'pages')!
    project = moveFile(project, folder.id, 'site')
    expect(project.entryFile).toBe('site/index.html')
    expect(project.files.find(file => file.id === html.id)?.path).toBe('site/index.html')
    expect(() => addFile(project, 'STYLES.css')).toThrow(/already exists/i)
    expect(() => addFile(project, 'ASSETS/icon.svg')).toThrow(/case/i)
    expect(() => moveFile(project, folder.id, 'site/sub/site')).toThrow(/inside itself/i)
    for (const path of ['../evil', '/absolute', 'a/../../b', 'C:/file', 'a//b', 'a/./b']) expect(() => validatePath(path)).toThrow()
  })
})
