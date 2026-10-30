// @vitest-environment node
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { exportProject, importProjectZip, parseBackup, createBackup } from '../services/archive'
import { addFile } from '../services/filesystem'
import { createProject } from '../services/templates'
import { defaultSettings } from '../types'

describe('archive and backup safety', () => {
  it('round-trips nested source and binary assets', async () => {
    let project = createProject('Round trip')
    project = addFile(project, 'assets/icons/test.png', 'AQIDBA==', 'file', true)
    const zip = await exportProject(project)
    const imported = await importProjectZip(zip, 'Imported')
    expect(imported.files.find(file => file.path === 'index.html')?.content).toBe(project.files.find(file => file.path === 'index.html')?.content)
    expect(imported.files.find(file => file.path === 'assets/icons/test.png')).toMatchObject({ binary: true, content: 'AQIDBA==' })
    expect(imported.id).not.toBe(project.id)
  })
  it('rejects traversal, absolute paths and backslashes before importing', async () => {
    for (const path of ['../escape.html', '/absolute.txt', 'sub/../../escape.js', 'sub\\escape.txt']) {
      const zip = new JSZip(); zip.file(path, 'bad', { createFolders: false })
      const blob = await zip.generateAsync({ type: 'blob' })
      await expect(importProjectZip(blob, 'Unsafe')).rejects.toThrow(/unsafe|relative|invalid/i)
    }
  })
  it('rejects duplicate central-directory names and oversized declared members', async () => {
    const zip = new JSZip(); zip.file('one.txt', 'one'); zip.file('two.txt', 'two')
    const raw = await zip.generateAsync({ type: 'uint8array' })
    const duplicate = raw.slice()
    const view = new DataView(duplicate.buffer)
    const headers: number[] = []
    for (let i = 0; i < duplicate.length - 46; i++) if (view.getUint32(i, true) === 0x02014b50) headers.push(i)
    expect(headers).toHaveLength(2)
    duplicate.set(new TextEncoder().encode('one.txt'), headers[1] + 46)
    await expect(importProjectZip(new Blob([duplicate]), 'Duplicate')).rejects.toThrow(/duplicate/i)
    const oversized = raw.slice()
    new DataView(oversized.buffer).setUint32(headers[0] + 24, 11 * 1024 * 1024, true)
    await expect(importProjectZip(new Blob([oversized]), 'Too large')).rejects.toThrow(/allowed size/i)
    const corrupt = raw.slice()
    new DataView(corrupt.buffer).setUint32(headers[0] + 16, 12345, true)
    await expect(importProjectZip(new Blob([corrupt]), 'Corrupt')).rejects.toThrow(/CRC/i)
  })
  it('restores backups as new projects without overwriting IDs', async () => {
    const project = createProject('Original')
    const restored = await parseBackup(createBackup([project], defaultSettings, []))
    expect(restored.projects[0].id).not.toBe(project.id)
    expect(restored.projects[0].files.find(file => file.path === 'index.html')?.content).toBe(project.files[0].content)
  })
})
