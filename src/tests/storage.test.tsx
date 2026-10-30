import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkspace } from '../app/useWorkspace'
import { openStorage, storage } from '../services/storage'
import { createProject } from '../services/templates'
import { defaultSettings } from '../types'

beforeEach(async () => {
  const db = await openStorage()
  await Promise.all([db.clear('projects'), db.clear('preferences'), db.clear('snippets')])
  localStorage.clear()
})

describe('IndexedDB persistence and recovery', () => {
  it('persists projects and settings with structured data', async () => {
    const project = createProject('Stored')
    await storage.saveProject(project)
    await storage.saveSettings({ ...defaultSettings, fontSize: 18, theme: 'light' })
    expect((await storage.getProject(project.id))?.files[0].content).toBe(project.files[0].content)
    expect(await storage.getSettings()).toMatchObject({ fontSize: 18, theme: 'light' })
  })
  it('does not recreate the example after an explicit deletion', async () => {
    const hook = renderHook(() => useWorkspace())
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    const projectId = hook.result.current.project!.id
    await act(async () => { await hook.result.current.removeProject(projectId) })
    hook.unmount()
    const reopened = renderHook(() => useWorkspace())
    await waitFor(() => expect(reopened.result.current.loading).toBe(false))
    expect(reopened.result.current.projects).toHaveLength(0)
    expect(reopened.result.current.project).toBeNull()
    reopened.unmount()
  })
  it('autosaves edited content, marks dirty files accurately and restores after restart', async () => {
    const hook = renderHook(() => useWorkspace())
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    const file = hook.result.current.project!.files[0]
    act(() => { hook.result.current.mutate(project => ({ ...project, files: project.files.map(item => item.id === file.id ? { ...item, content: 'Recovered content' } : item) })) })
    expect(hook.result.current.dirtyIds.has(file.id)).toBe(true)
    expect(hook.result.current.status).toBe('unsaved')
    await waitFor(() => expect(hook.result.current.status).toBe('saved'), { timeout: 3500 })
    expect(hook.result.current.dirtyIds.has(file.id)).toBe(false)
    hook.unmount()
    const reopened = renderHook(() => useWorkspace())
    await waitFor(() => expect(reopened.result.current.loading).toBe(false))
    expect(reopened.result.current.project?.files.find(item => item.id === file.id)?.content).toBe('Recovered content')
    reopened.unmount()
  })
})
