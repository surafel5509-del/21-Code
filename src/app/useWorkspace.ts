import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Project, Settings, Snippet } from '../types'
import { defaultSettings } from '../types'
import { createProject } from '../services/templates'
import { storage } from '../services/storage'
import { id } from '../services/filesystem'

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'
const contentSnapshot = (project: Project) => new Map(project.files.filter(file => file.kind === 'file').map(file => [file.id, `${file.path}\u0000${file.content}`]))

export function useWorkspace() {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [loading, setLoading] = useState(true)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [statusTick, setStatusTick] = useState(0)
  const projectsRef = useRef<Project[]>([])
  const activeIdRef = useRef<string | null>(null)
  const settingsRef = useRef(settings)
  const versions = useRef(new Map<string, number>())
  const saved = useRef(new Map<string, Map<string, string>>())
  const statuses = useRef(new Map<string, SaveStatus>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const chains = useRef(new Map<string, Promise<void>>())
  const deleted = useRef(new Set<string>())
  settingsRef.current = settings
  const notifyStatus = () => setStatusTick(value => value + 1)
  const updateProjects = (next: Project[]) => { projectsRef.current = next; setProjects(next) }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        let [storedProjects, storedSettings, storedSnippets, initialized] = await Promise.all([storage.getProjects(), storage.getSettings(), storage.getSnippets(), storage.isInitialized()])
        if (!storedProjects.length && !initialized) {
          const example = createProject('Starter Website', 'studio')
          await storage.saveProject(example)
          storedProjects = [example]
        }
        if (!initialized) await storage.setInitialized()
        if (cancelled) return
        for (const project of storedProjects) { saved.current.set(project.id, contentSnapshot(project)); statuses.current.set(project.id, 'saved'); versions.current.set(project.id, 0) }
        updateProjects(storedProjects)
        setSettings(storedSettings); settingsRef.current = storedSettings; setSnippets(storedSnippets)
        let recent: string | null = null
        try { recent = localStorage.getItem('21code.activeProject') } catch { /* selection is optional */ }
        const initial = storedProjects.find(p => p.id === recent && !p.archived) ?? [...storedProjects].filter(p => !p.archived).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? storedProjects[0]
        activeIdRef.current = initial?.id ?? null; setActiveId(initial?.id ?? null)
      } catch (error) {
        if (cancelled) return
        const example = createProject('Starter Website', 'studio')
        updateProjects([example]); activeIdRef.current = example.id; setActiveId(example.id)
        statuses.current.set(example.id, 'error')
        setStorageError(`Local storage is unavailable. Changes may be lost. ${error instanceof Error ? error.message : ''}`)
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const saveProject = useCallback(async (projectId?: string): Promise<boolean> => {
    const target = projectId ?? activeIdRef.current
    if (!target || deleted.current.has(target)) return false
    const timer = timers.current.get(target)
    if (timer) { clearTimeout(timer); timers.current.delete(target) }
    const project = projectsRef.current.find(item => item.id === target)
    if (!project) return false
    const snapshot = structuredClone(project)
    const revision = versions.current.get(target) ?? 0
    statuses.current.set(target, 'saving'); notifyStatus()
    let success = false
    const previous = chains.current.get(target) ?? Promise.resolve()
    const task = previous.catch(() => undefined).then(async () => {
      if (deleted.current.has(target)) return
      try {
        await storage.saveProject(snapshot)
        saved.current.set(target, contentSnapshot(snapshot))
        statuses.current.set(target, (versions.current.get(target) ?? 0) === revision ? 'saved' : 'unsaved')
        setStorageError(null); success = true
      } catch (error) {
        statuses.current.set(target, 'error')
        setStorageError(`Save failed. Export a backup before closing. ${error instanceof Error ? error.message : 'Check browser storage permissions and space.'}`)
      }
      notifyStatus()
    })
    chains.current.set(target, task)
    await task
    return success
  }, [])

  const schedule = useCallback((projectId: string) => {
    const old = timers.current.get(projectId)
    if (old) clearTimeout(old)
    timers.current.set(projectId, setTimeout(() => { void saveProject(projectId) }, settingsRef.current.autosaveMs))
  }, [saveProject])

  const mutate = useCallback((fn: (project: Project) => Project, projectId?: string) => {
    const target = projectId ?? activeIdRef.current
    if (!target) return
    const project = projectsRef.current.find(item => item.id === target)
    if (!project) return
    const next = fn(project)
    if (next === project) return
    updateProjects(projectsRef.current.map(item => item.id === target ? next : item))
    versions.current.set(target, (versions.current.get(target) ?? 0) + 1)
    statuses.current.set(target, 'unsaved'); notifyStatus(); schedule(target)
  }, [schedule])

  const openProject = useCallback((projectId: string) => {
    if (!projectsRef.current.some(project => project.id === projectId)) return
    const previous = activeIdRef.current
    if (previous && previous !== projectId && statuses.current.get(previous) !== 'saved') void saveProject(previous)
    activeIdRef.current = projectId; setActiveId(projectId)
    try { localStorage.setItem('21code.activeProject', projectId) } catch { /* optional */ }
  }, [saveProject])

  const addProject = useCallback(async (project: Project) => {
    // Do not label a new project saved until its write succeeds.
    try {
      await storage.saveProject(project)
      saved.current.set(project.id, contentSnapshot(project)); statuses.current.set(project.id, 'saved'); versions.current.set(project.id, 0)
      updateProjects([...projectsRef.current, project]); setStorageError(null); openProject(project.id); notifyStatus()
    } catch (error) {
      setStorageError(`Could not create project in local storage: ${error instanceof Error ? error.message : 'Storage unavailable.'}`)
      throw error
    }
  }, [openProject])

  const removeProject = useCallback(async (projectId: string) => {
    deleted.current.add(projectId)
    const timer = timers.current.get(projectId); if (timer) clearTimeout(timer)
    await chains.current.get(projectId)?.catch(() => undefined)
    try {
      await storage.deleteProject(projectId)
      const next = projectsRef.current.filter(project => project.id !== projectId)
      updateProjects(next); saved.current.delete(projectId); statuses.current.delete(projectId)
      if (activeIdRef.current === projectId) {
        const fallback = next.find(project => !project.archived) ?? next[0]
        activeIdRef.current = fallback?.id ?? null; setActiveId(fallback?.id ?? null)
      }
      notifyStatus()
    } catch (error) { deleted.current.delete(projectId); throw error }
  }, [])

  const duplicateProject = useCallback(async (projectId: string) => {
    const original = projectsRef.current.find(project => project.id === projectId)
    if (!original) return
    const idMap = new Map(original.files.map(file => [file.id, id()]))
    const copy: Project = { ...structuredClone(original), id: id(), name: `${original.name} copy`.slice(0, 80), pinned: false, archived: false, createdAt: Date.now(), updatedAt: Date.now(), files: original.files.map(file => ({ ...file, id: idMap.get(file.id)! })), openTabs: original.openTabs.map(fileId => idMap.get(fileId)!).filter(Boolean), activeFileId: original.activeFileId ? idMap.get(original.activeFileId) ?? null : null }
    await addProject(copy)
  }, [addProject])

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next); settingsRef.current = next
    void storage.saveSettings(next).catch(error => setStorageError(`Could not save settings: ${error instanceof Error ? error.message : 'Storage unavailable.'}`))
  }, [])
  const saveSnippet = useCallback(async (snippet: Snippet) => {
    await storage.saveSnippet(snippet)
    setSnippets(current => [...current.filter(item => item.id !== snippet.id), snippet])
  }, [])
  const removeSnippet = useCallback(async (snippetId: string) => { await storage.deleteSnippet(snippetId); setSnippets(current => current.filter(item => item.id !== snippetId)) }, [])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if ([...statuses.current.values()].some(status => status !== 'saved')) { event.preventDefault(); event.returnValue = '' }
    }
    const visibility = () => { if (document.visibilityState === 'hidden') for (const [projectId, status] of statuses.current) if (status !== 'saved') void saveProject(projectId) }
    window.addEventListener('beforeunload', beforeUnload); document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('visibilitychange', visibility) }
  }, [saveProject])

  const project = useMemo(() => projects.find(item => item.id === activeId) ?? null, [projects, activeId])
  const dirtyIds = useMemo(() => {
    void statusTick
    if (!project) return new Set<string>()
    const snapshot = saved.current.get(project.id)
    return new Set(project.files.filter(file => file.kind === 'file' && snapshot?.get(file.id) !== `${file.path}\u0000${file.content}`).map(file => file.id))
  }, [project, statusTick])
  return { projects, project, activeId, settings, snippets, loading, storageError, status: activeId ? statuses.current.get(activeId) ?? 'saved' : 'saved', dirtyIds, mutate, openProject, addProject, removeProject, duplicateProject, saveProject, updateSettings, saveSnippet, removeSnippet }
}
