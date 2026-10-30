import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Project, Settings, Snippet } from '../types'
import { defaultSettings } from '../types'

interface CodeDB extends DBSchema {
  projects: { key: string; value: Project }
  preferences: { key: string; value: Settings | boolean }
  snippets: { key: string; value: Snippet }
}

let dbPromise: Promise<IDBPDatabase<CodeDB>> | undefined
export function openStorage(): Promise<IDBPDatabase<CodeDB>> {
  if (!dbPromise) dbPromise = openDB<CodeDB>('21-code-workspace', 1, {
    upgrade(db) {
      db.createObjectStore('projects', { keyPath: 'id' })
      db.createObjectStore('preferences')
      db.createObjectStore('snippets', { keyPath: 'id' })
    },
    blocked() { console.warn('Close other 21 Code tabs to allow the database to upgrade.') },
    blocking() { void dbPromise?.then(db => db.close()) },
  }).catch(error => { dbPromise = undefined; throw error })
  return dbPromise
}

export const storage = {
  async getProjects(): Promise<Project[]> { return (await openStorage()).getAll('projects') },
  async getProject(id: string): Promise<Project | undefined> { return (await openStorage()).get('projects', id) },
  async saveProject(project: Project): Promise<void> { await (await openStorage()).put('projects', structuredClone(project)) },
  async deleteProject(id: string): Promise<void> { await (await openStorage()).delete('projects', id) },
  async getSettings(): Promise<Settings> {
    const stored = await (await openStorage()).get('preferences', 'settings')
    return stored && typeof stored === 'object' ? { ...defaultSettings, ...stored, shortcuts: { ...defaultSettings.shortcuts, ...stored.shortcuts } } : { ...defaultSettings }
  },
  async saveSettings(settings: Settings): Promise<void> { await (await openStorage()).put('preferences', structuredClone(settings), 'settings') },
  async isInitialized(): Promise<boolean> { return (await (await openStorage()).get('preferences', 'initialized')) === true },
  async setInitialized(): Promise<void> { await (await openStorage()).put('preferences', true, 'initialized') },
  async getSnippets(): Promise<Snippet[]> { return (await openStorage()).getAll('snippets') },
  async saveSnippet(snippet: Snippet): Promise<void> { await (await openStorage()).put('snippets', structuredClone(snippet)) },
  async deleteSnippet(id: string): Promise<void> { await (await openStorage()).delete('snippets', id) },
}
