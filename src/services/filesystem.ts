import type { Project, ProjectFile } from '../types'

export const MAX_FILE_SIZE = 10 * 1024 * 1024
export const MAX_PROJECT_SIZE = 60 * 1024 * 1024
export const MAX_FILES = 1500
const textExtensions = new Set(['html','htm','css','js','mjs','cjs','ts','tsx','jsx','json','md','markdown','xml','svg','txt','yml','yaml','map','csv'])
const mimeTypes: Record<string, string> = {
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', cjs: 'text/javascript',
  ts: 'text/plain', tsx: 'text/plain', jsx: 'text/plain', json: 'application/json', md: 'text/markdown', xml: 'application/xml', svg: 'image/svg+xml',
  txt: 'text/plain', yml: 'text/yaml', yaml: 'text/yaml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  mp3: 'audio/mpeg', mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf',
}

export function id(): string { return crypto.randomUUID() }
export function extension(path: string): string { return path.split('/').pop()?.split('.').slice(1).pop()?.toLowerCase() ?? '' }
export function basename(path: string): string { return path.split('/').pop() || path }
export function dirname(path: string): string { const index = path.lastIndexOf('/'); return index < 0 ? '' : path.slice(0, index) }
export function isTextPath(path: string): boolean { return textExtensions.has(extension(path)) || !basename(path).includes('.') }
export function mimeFor(path: string): string { return mimeTypes[extension(path)] ?? 'application/octet-stream' }

/** Paths are project-relative, canonical and never allowed to escape the project root. */
export function validatePath(input: string): string {
  const path = input.trim().replace(/\\/g, '/')
  if (!path || path.startsWith('/') || /^[A-Za-z]:/.test(path)) throw new Error('Use a relative path inside the project.')
  const parts = path.split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || /[\x00-\x1f\x7f]/.test(part))) throw new Error('Invalid path. Empty, dot and parent segments are not allowed.')
  if (parts.some(part => part.length > 255) || path.length > 1024) throw new Error('That path is too long.')
  return parts.join('/')
}

export function byteSize(file: ProjectFile): number {
  if (file.kind === 'folder') return 0
  return file.binary ? Math.floor(file.content.length * 3 / 4) - (file.content.endsWith('==') ? 2 : file.content.endsWith('=') ? 1 : 0) : new TextEncoder().encode(file.content).length
}
export function projectSize(files: ProjectFile[]): number { return files.reduce((sum, file) => sum + byteSize(file), 0) }
export function humanSize(bytes: number): string { return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB` }

export function makeFile(path: string, content = '', kind: 'file' | 'folder' = 'file', binary = false): ProjectFile {
  const safePath = validatePath(path)
  return { id: id(), path: safePath, kind, content: kind === 'folder' ? '' : content, binary: kind === 'file' && binary, mime: mimeFor(safePath), updatedAt: Date.now() }
}

function ensureParents(files: ProjectFile[], path: string): ProjectFile[] {
  const segments = dirname(path).split('/').filter(Boolean)
  const result = [...files]
  let current = ''
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment
    const existing = result.find(file => file.path.toLowerCase() === current.toLowerCase())
    if (existing && existing.path !== current) throw new Error(`Folder name differs only by case from “${existing.path}”.`)
    if (existing?.kind === 'file') throw new Error(`“${current}” is a file, not a folder.`)
    if (!existing) result.push(makeFile(current, '', 'folder'))
  }
  return result
}

export function addFile(project: Project, path: string, content = '', kind: 'file' | 'folder' = 'file', binary = false): Project {
  const clean = validatePath(path)
  if (project.files.some(file => file.path.toLowerCase() === clean.toLowerCase())) throw new Error(`“${clean}” already exists.`)
  if (project.files.length >= MAX_FILES) throw new Error(`A project can contain at most ${MAX_FILES} files and folders.`)
  const file = makeFile(clean, content, kind, binary)
  if (byteSize(file) > MAX_FILE_SIZE) throw new Error('Files are limited to 10 MB.')
  if (projectSize(project.files) + byteSize(file) > MAX_PROJECT_SIZE) throw new Error('Projects are limited to 60 MB.')
  const files = [...ensureParents(project.files, clean), file]
  if (files.length > MAX_FILES) throw new Error(`A project can contain at most ${MAX_FILES} files and folders.`)
  return { ...project, files, updatedAt: Date.now() }
}

export function moveFile(project: Project, fileId: string, newPath: string): Project {
  const file = project.files.find(item => item.id === fileId)
  if (!file) throw new Error('File not found.')
  const clean = validatePath(newPath)
  if (file.path === clean) return project
  if (file.kind === 'folder' && clean.startsWith(`${file.path}/`)) throw new Error('A folder cannot be moved inside itself.')
  const affected = project.files.filter(item => item.id === fileId || (file.kind === 'folder' && item.path.startsWith(`${file.path}/`)))
  const affectedIds = new Set(affected.map(item => item.id))
  for (const item of affected) {
    const next = clean + item.path.slice(file.path.length)
    if (project.files.some(other => !affectedIds.has(other.id) && other.path.toLowerCase() === next.toLowerCase())) throw new Error(`“${next}” already exists.`)
  }
  let files = project.files.map(item => affectedIds.has(item.id) ? { ...item, path: clean + item.path.slice(file.path.length), mime: mimeFor(clean + item.path.slice(file.path.length)), updatedAt: Date.now() } : item)
  files = ensureParents(files, clean)
  return { ...project, files, entryFile: project.entryFile === file.path || project.entryFile.startsWith(`${file.path}/`) ? clean + project.entryFile.slice(file.path.length) : project.entryFile, updatedAt: Date.now() }
}

export function deleteFile(project: Project, fileId: string): Project {
  const file = project.files.find(item => item.id === fileId)
  if (!file) throw new Error('File not found.')
  const removed = new Set(project.files.filter(item => item.id === fileId || (file.kind === 'folder' && item.path.startsWith(`${file.path}/`))).map(item => item.id))
  const openTabs = project.openTabs.filter(id => !removed.has(id))
  return { ...project, files: project.files.filter(item => !removed.has(item.id)), openTabs, activeFileId: project.activeFileId && !removed.has(project.activeFileId) ? project.activeFileId : openTabs[openTabs.length - 1] ?? null, updatedAt: Date.now() }
}

export function duplicateFile(project: Project, fileId: string, targetPath: string): Project {
  const file = project.files.find(item => item.id === fileId)
  if (!file) throw new Error('File not found.')
  if (file.kind === 'folder') throw new Error('Duplicate individual files, not folders.')
  return addFile(project, targetPath, file.content, 'file', file.binary)
}

export function openFile(project: Project, fileId: string): Project {
  const file = project.files.find(item => item.id === fileId && item.kind === 'file')
  if (!file) return project
  return { ...project, openTabs: project.openTabs.includes(fileId) ? project.openTabs : [...project.openTabs, fileId], activeFileId: fileId }
}
export function closeFile(project: Project, fileId: string): Project {
  const index = project.openTabs.indexOf(fileId)
  const openTabs = project.openTabs.filter(tab => tab !== fileId)
  return { ...project, openTabs, activeFileId: project.activeFileId === fileId ? openTabs[Math.min(index, openTabs.length - 1)] ?? null : project.activeFileId }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let result = ''
  for (let i = 0; i < bytes.length; i += 0x8000) result += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(result)
}
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}
export async function importBrowserFile(file: File, path = file.name): Promise<ProjectFile> {
  const safePath = validatePath(path)
  if (file.size > MAX_FILE_SIZE) throw new Error(`“${file.name}” exceeds the 10 MB file limit.`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const binary = !isTextPath(safePath)
  return makeFile(safePath, binary ? bytesToBase64(bytes) : new TextDecoder('utf-8', { fatal: true }).decode(bytes), 'file', binary)
}
