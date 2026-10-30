import { Capacitor, registerPlugin } from '@capacitor/core'
import { bytesToBase64 } from './filesystem'

export interface AndroidFileExport {
  begin(options: { name: string; mime: string }): Promise<{ cancelled: boolean }>
  write(options: { data: string }): Promise<void>
  finish(): Promise<void>
  abort(): Promise<void>
}

const CHUNK_SIZE = 384 * 1024

/** Stream bounded chunks to Android's document picker instead of relying on WebView downloads. */
export async function saveWithAndroid(blob: Blob, filename: string, plugin: AndroidFileExport, onProgress?: (percent: number) => void): Promise<boolean> {
  const result = await plugin.begin({ name: filename, mime: blob.type || 'application/octet-stream' })
  if (result.cancelled) return false
  try {
    for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + CHUNK_SIZE).arrayBuffer())
      await plugin.write({ data: bytesToBase64(bytes) })
      onProgress?.(Math.round(Math.min(offset + bytes.length, blob.size) / blob.size * 100))
    }
    await plugin.finish()
    return true
  } catch (error) {
    try { await plugin.abort() } catch { /* Keep the original failure. */ }
    throw error
  }
}

/** Returns false when the user cancels the Android save dialog. */
export async function downloadBlob(blob: Blob, filename: string, onProgress?: (percent: number) => void): Promise<boolean> {
  if (Capacitor.getPlatform() === 'android') {
    return saveWithAndroid(blob, filename, registerPlugin<AndroidFileExport>('FileExport'), onProgress)
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}
