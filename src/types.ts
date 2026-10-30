export type FileKind = 'file' | 'folder'

export interface ProjectFile {
  id: string
  path: string
  kind: FileKind
  /** Text for source files; base64 (without data URL prefix) for binary assets. */
  content: string
  binary: boolean
  mime: string
  updatedAt: number
}

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  pinned: boolean
  archived: boolean
  entryFile: string
  files: ProjectFile[]
  openTabs: string[]
  activeFileId: string | null
}

export interface Settings {
  theme: 'dark' | 'light' | 'system'
  accent: 'cyan' | 'violet' | 'green'
  fontFamily: 'mono' | 'system' | 'serif'
  fontSize: number
  lineHeight: number
  tabSize: number
  wordWrap: boolean
  autosaveMs: number
  autoPreview: boolean
  previewDebounceMs: number
  formatOnSave: boolean
  explorerSort: 'name' | 'type'
  recentLimit: number
  reducedMotion: boolean
  shortcuts: { save: string; preview: string; palette: string }
}

export interface Snippet {
  id: string
  name: string
  category: string
  description: string
  body: string
  builtin?: boolean
}

export interface ConsoleMessage {
  id: string
  level: 'log' | 'info' | 'warn' | 'error'
  message: string
  source?: string
  line?: number
  time: number
}

export interface Diagnostic {
  id: string
  severity: 'error' | 'warning' | 'info'
  message: string
  path?: string
  line?: number
}

export const defaultSettings: Settings = {
  theme: 'dark', accent: 'cyan', fontFamily: 'mono', fontSize: 13, lineHeight: 1.7,
  tabSize: 2, wordWrap: false, autosaveMs: 900, autoPreview: true, previewDebounceMs: 700,
  formatOnSave: false, explorerSort: 'name', recentLimit: 12, reducedMotion: false,
  shortcuts: { save: 'Mod+S', preview: 'Mod+Enter', palette: 'Mod+Shift+P' },
}
