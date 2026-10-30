// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { saveWithAndroid, type AndroidFileExport } from '../services/download'

function plugin(cancelled = false): AndroidFileExport {
  return { begin: vi.fn().mockResolvedValue({ cancelled }), write: vi.fn().mockResolvedValue(undefined), finish: vi.fn().mockResolvedValue(undefined), abort: vi.fn().mockResolvedValue(undefined) }
}

describe('Android document export', () => {
  it('streams bounded chunks and finishes only after all bytes are written', async () => {
    const bytes = new Uint8Array(800_000).map((_, i) => i % 251)
    const save = plugin()
    const progress: number[] = []
    expect(await saveWithAndroid(new Blob([bytes], { type: 'application/zip' }), 'project.zip', save, percent => progress.push(percent))).toBe(true)
    const writes = vi.mocked(save.write).mock.calls.map(([value]) => Buffer.from(value.data, 'base64'))
    expect(writes).toHaveLength(3)
    expect(Buffer.concat(writes)).toEqual(Buffer.from(bytes))
    expect(save.begin).toHaveBeenCalledWith({ name: 'project.zip', mime: 'application/zip' })
    expect(save.finish).toHaveBeenCalledOnce()
    expect(progress.at(-1)).toBe(100)
  })
  it('does not report success when the user cancels', async () => {
    const save = plugin(true)
    expect(await saveWithAndroid(new Blob(['hello']), 'a.txt', save)).toBe(false)
    expect(save.write).not.toHaveBeenCalled()
    expect(save.finish).not.toHaveBeenCalled()
  })
  it('aborts a partial file and reports a write failure', async () => {
    const save = plugin()
    vi.mocked(save.write).mockRejectedValue(new Error('disk full'))
    await expect(saveWithAndroid(new Blob(['hello']), 'a.txt', save)).rejects.toThrow('disk full')
    expect(save.abort).toHaveBeenCalledOnce()
    expect(save.finish).not.toHaveBeenCalled()
  })
})
