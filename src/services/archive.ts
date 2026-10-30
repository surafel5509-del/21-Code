import JSZip from 'jszip'
import type { Project, ProjectFile, Settings, Snippet } from '../types'
import { downloadBlob } from './download'
import { addFile, base64ToBytes, byteSize, bytesToBase64, id, isTextPath, MAX_FILE_SIZE, MAX_FILES, MAX_PROJECT_SIZE, mimeFor, projectSize, validatePath } from './filesystem'

const MAX_ZIP_SIZE = 30 * 1024 * 1024

/** Inspect the central directory before JSZip normalizes paths or allocates output. */
function inspectZip(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let pos = bytes.length - 22; pos >= Math.max(0, bytes.length - 65_557); pos--) {
    if (view.getUint32(pos, true) === 0x06054b50 && pos + 22 + view.getUint16(pos + 20, true) === bytes.length) { end = pos; break }
  }
  if (end < 0) throw new Error('Invalid ZIP: end-of-directory record not found.')
  const disk = view.getUint16(end + 4, true), centralDisk = view.getUint16(end + 6, true)
  const entries = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), offset = view.getUint32(end + 16, true)
  if (disk || centralDisk || view.getUint16(end + 8, true) !== entries || entries === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw new Error('Multi-disk and ZIP64 archives are not supported.')
  if (entries > MAX_FILES || offset + size !== end) throw new Error('Invalid or oversized ZIP directory.')
  const seen = new Set<string>()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let pos = offset, expanded = 0
  for (let i = 0; i < entries; i++) {
    if (pos + 46 > end || view.getUint32(pos, true) !== 0x02014b50) throw new Error('Invalid ZIP directory entry.')
    const flags = view.getUint16(pos + 8, true), method = view.getUint16(pos + 10, true), uncompressed = view.getUint32(pos + 24, true)
    const nameLength = view.getUint16(pos + 28, true), extraLength = view.getUint16(pos + 30, true), commentLength = view.getUint16(pos + 32, true)
    const next = pos + 46 + nameLength + extraLength + commentLength
    if (next > end || !nameLength || flags & 1 || ![0, 8].includes(method)) throw new Error('ZIP contains an invalid, encrypted, or unsupported entry.')
    let name: string
    try { name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength)) } catch { throw new Error('ZIP contains a filename that is not valid UTF-8.') }
    // Check the Unicode Path extra field as well; it can override the raw name in ZIP readers.
    let effective = name
    let extra = pos + 46 + nameLength
    const extraEnd = extra + extraLength
    while (extra + 4 <= extraEnd) {
      const type = view.getUint16(extra, true), length = view.getUint16(extra + 2, true)
      if (extra + 4 + length > extraEnd) throw new Error('Invalid ZIP extra field.')
      if (type === 0x7075 && length >= 5) {
        try { effective = decoder.decode(bytes.subarray(extra + 9, extra + 4 + length)) } catch { throw new Error('Invalid Unicode filename in ZIP.') }
      }
      extra += 4 + length
    }
    for (const candidate of [name, effective]) {
      if (candidate.includes('\\') || candidate.startsWith('/') || /^[A-Za-z]:/.test(candidate) || candidate.split('/').some(part => part === '..' || part === '.')) throw new Error(`Unsafe archive path rejected: ${candidate}`)
      validatePath(candidate.replace(/\/$/, ''))
    }
    const key = effective.replace(/\/$/, '').toLowerCase()
    if (seen.has(key)) throw new Error(`Duplicate archive path: ${effective}`)
    seen.add(key)
    if (!effective.endsWith('/')) expanded += uncompressed
    if (uncompressed > MAX_FILE_SIZE || expanded > MAX_PROJECT_SIZE) throw new Error('The archive expands beyond the allowed size (10 MB per file, 60 MB total).')
    pos = next
  }
  if (pos !== end) throw new Error('Invalid ZIP directory size.')
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** Stream each member and stop as soon as its real expanded size exceeds the limit. */
function readEntry(entry: JSZip.JSZipObject, remaining: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []; let length = 0; let stopped = false
    type ZipStream = { on: (event: string, callback: (value: never) => void) => ZipStream; pause: () => void; resume: () => void }
    const stream = (entry as unknown as { internalStream: (type: string) => ZipStream }).internalStream('uint8array')
    stream.on('data', (chunk: Uint8Array) => {
      if (stopped) return
      length += chunk.length
      if (length > MAX_FILE_SIZE || length > remaining) { stopped = true; stream.pause(); reject(new Error('The archive expands beyond the allowed size (10 MB per file, 60 MB total).')); return }
      chunks.push(chunk)
    }).on('error', (error: Error) => { if (!stopped) { stopped = true; reject(error) } }).on('end', () => {
      if (stopped) return
      const result = new Uint8Array(length); let offset = 0
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
      resolve(result)
    }).resume()
  })
}

export async function exportProject(project: Project, onProgress?: (percent: number) => void): Promise<Blob> {
  const zip = new JSZip()
  for (const file of project.files) {
    if (file.kind === 'folder') zip.folder(file.path)
    else zip.file(file.path, file.binary ? base64ToBytes(file.content) : file.content)
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, meta => onProgress?.(Math.round(meta.percent)))
}

/** Reject unsafe original names, including the traversal names normalized by JSZip. */
export async function importProjectZip(blob: Blob, name: string, onProgress?: (percent: number) => void): Promise<Project> {
  if (blob.size > MAX_ZIP_SIZE) throw new Error('ZIP files are limited to 30 MB compressed.')
  const cleanName = name.trim()
  if (!cleanName || cleanName.length > 80) throw new Error('Project name must be between 1 and 80 characters.')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  inspectZip(bytes)
  let zip: JSZip
  try { zip = await JSZip.loadAsync(bytes, { checkCRC32: false }) }
  catch { throw new Error('This ZIP could not be read. Check that the archive is valid and not encrypted.') }
  const entries = Object.values(zip.files)
  if (entries.length > MAX_FILES) throw new Error(`The archive contains more than ${MAX_FILES} entries.`)
  const now = Date.now()
  let project: Project = { id: id(), name: cleanName, createdAt: now, updatedAt: now, pinned: false, archived: false, entryFile: 'index.html', files: [], openTabs: [], activeFileId: null }
  const seen = new Set<string>()
  let total = 0
  for (const [index, entry] of entries.entries()) {
    // JSZip exposes unsafeOriginalName on files but not directories. Check both forms.
    const original = (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name
    if (original.includes('\\') || original.startsWith('/') || /^[A-Za-z]:/.test(original) || original.split('/').some(part => part === '..' || part === '.')) throw new Error(`Unsafe archive path rejected: ${original}`)
    const clean = validatePath(original.replace(/\/$/, ''))
    const key = clean.toLowerCase()
    if (seen.has(key)) throw new Error(`Duplicate archive path: ${clean}`)
    seen.add(key)
    // JSZip holds declared decompressed size here. Enforce it before allocating the output.
    const declared = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
    if (typeof declared === 'number' && (declared > MAX_FILE_SIZE || total + declared > MAX_PROJECT_SIZE)) throw new Error('The archive expands beyond the allowed size (10 MB per file, 60 MB total).')
    if (entry.dir) {
      const existing = project.files.find(file => file.path.toLowerCase() === key)
      if (existing && existing.kind !== 'folder') throw new Error(`Duplicate archive path: ${clean}`)
      if (!existing) project = addFile(project, clean, '', 'folder')
    } else {
      const bytes = await readEntry(entry, MAX_PROJECT_SIZE - total)
      const declaredCrc = (entry as unknown as { _data?: { crc32?: number } })._data?.crc32
      if (typeof declaredCrc === 'number' && crc32(bytes) !== (declaredCrc >>> 0)) throw new Error(`CRC check failed for “${clean}”. The ZIP may be corrupt.`)
      total += bytes.byteLength
      if (bytes.byteLength > MAX_FILE_SIZE || total > MAX_PROJECT_SIZE) throw new Error('The archive expands beyond the allowed size (10 MB per file, 60 MB total).')
      let content: string
      let binary = !isTextPath(clean)
      if (binary) content = bytesToBase64(bytes)
      else {
        try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
        catch { binary = true; content = bytesToBase64(bytes) }
      }
      project = addFile(project, clean, content, 'file', binary)
    }
    onProgress?.(Math.round((index + 1) / entries.length * 100))
    if (index % 20 === 0) await new Promise(resolve => setTimeout(resolve, 0))
  }
  const html = project.files.find(file => file.path.toLowerCase() === 'index.html') ?? project.files.find(file => /\.html?$/i.test(file.path))
  if (html) project = { ...project, entryFile: html.path, activeFileId: html.id, openTabs: [html.id] }
  return project
}

export async function downloadFile(file: ProjectFile, onProgress?: (percent: number) => void): Promise<boolean> {
  const data = file.binary ? base64ToBytes(file.content) : file.content
  return downloadBlob(new Blob([data as BlobPart], { type: file.mime || 'application/octet-stream' }), file.path.split('/').pop() || 'file', onProgress)
}

export interface Backup { version: 1; exportedAt: string; projects: Project[]; settings: Settings; snippets: Snippet[] }
export function createBackup(projects: Project[], settings: Settings, snippets: Snippet[]): Blob {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), projects, settings, snippets }, null, 2)], { type: 'application/json' })
  if (blob.size > 100 * 1024 * 1024) throw new Error('Backup would exceed the 100 MB restore limit. Export individual project ZIPs instead.')
  return blob
}

/** Validate content and paths, then assign new IDs so restoring never overwrites existing projects. */
export async function parseBackup(file: Blob): Promise<Backup> {
  if (file.size > 100 * 1024 * 1024) throw new Error('Backup is larger than 100 MB.')
  let value: unknown
  try { value = JSON.parse(await file.text()) } catch { throw new Error('Invalid backup JSON.') }
  if (!value || typeof value !== 'object' || (value as Backup).version !== 1 || !Array.isArray((value as Backup).projects)) throw new Error('Not a supported 21 Code backup.')
  const backup = value as Backup
  if (backup.projects.length > 100) throw new Error('Backup contains too many projects.')
  const projects: Project[] = []
  for (const raw of backup.projects) {
    if (!raw || typeof raw.name !== 'string' || !raw.name.trim() || !Array.isArray(raw.files) || raw.files.length > MAX_FILES) throw new Error('A project in this backup is invalid.')
    const now = Date.now()
    let project: Project = { id: id(), name: raw.name.trim().slice(0, 80), createdAt: now, updatedAt: now, pinned: !!raw.pinned, archived: !!raw.archived, entryFile: typeof raw.entryFile === 'string' ? validatePath(raw.entryFile) : 'index.html', files: [], openTabs: [], activeFileId: null }
    for (const f of raw.files) {
      if (!f || typeof f.path !== 'string' || typeof f.content !== 'string' || (f.kind !== 'file' && f.kind !== 'folder')) throw new Error('A file in this backup is invalid.')
      if (typeof f.binary !== 'boolean' || (f.binary && (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.content)))) throw new Error('A binary file in this backup is invalid.')
      const path = validatePath(f.path)
      const existing = project.files.find(item => item.path.toLowerCase() === path.toLowerCase())
      if (existing && !(existing.kind === 'folder' && f.kind === 'folder')) throw new Error(`Duplicate path in backup: ${path}`)
      if (!existing) project = addFile(project, path, f.content, f.kind, !!f.binary)
      // Never trust a backup's MIME type.
      project.files[project.files.length - 1].mime = mimeFor(project.files[project.files.length - 1].path)
    }
    if (projectSize(project.files) > MAX_PROJECT_SIZE || project.files.some(f => byteSize(f) > MAX_FILE_SIZE)) throw new Error('A backup project exceeds size limits.')
    const entry = project.files.find(f => f.path === project.entryFile && f.kind === 'file')
    if (entry) { project.activeFileId = entry.id; project.openTabs = [entry.id] }
    projects.push(project)
  }
  return { version: 1, exportedAt: typeof backup.exportedAt === 'string' ? backup.exportedAt : '', projects, settings: backup.settings, snippets: Array.isArray(backup.snippets) ? backup.snippets : [] }
}
