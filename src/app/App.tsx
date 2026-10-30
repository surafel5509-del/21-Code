import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Braces, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Code2, Command, Copy, Download, FilePlus2, FolderOpen, LayoutDashboard, Menu, MoreHorizontal, PanelLeft, Play, Plus, Redo2, Save, Search, Settings2, TerminalSquare, Undo2, Upload, WrapText, X } from 'lucide-react'
import type { ConsoleMessage, Diagnostic, ProjectFile, Snippet } from '../types'
import { defaultSettings } from '../types'
import { addFile, basename, byteSize, closeFile, deleteFile, dirname, duplicateFile, extension, humanSize, importBrowserFile, MAX_FILE_SIZE, MAX_PROJECT_SIZE, moveFile, openFile } from '../services/filesystem'
import { createProject } from '../services/templates'
import { createBackup, downloadFile, exportProject, importProjectZip, parseBackup } from '../services/archive'
import { downloadBlob } from '../services/download'
import { formatSource, supportsFormatting } from '../services/formatter'
import { localDiagnostics } from '../services/diagnostics'
import { replaceMatches, type SearchMatch } from '../services/search'
import { builtinSnippets, validateSnippet } from '../services/snippets'
import { shortcutFromEvent, validateSettings } from '../services/settings'
import { useWorkspace } from './useWorkspace'
import { CodeEditor, type EditorCommand, type EditorHandle } from '../components/editor/CodeEditor'
import { AccessoryBar } from '../components/editor/AccessoryBar'
import { Explorer, type FileAction } from '../components/layout/Explorer'
import { BottomPanel } from '../components/layout/BottomPanel'
import { FileIcon, IconButton, Logo, Modal } from '../components/layout/Common'
import { PreviewPanel } from '../components/preview/PreviewPanel'
import { Dashboard } from '../features/Dashboard'
import { SearchPanel } from '../features/SearchPanel'
import { SnippetsPanel } from '../features/SnippetsPanel'
import { SettingsDialog } from '../features/SettingsDialog'
import { CommandPalette, type PaletteAction } from '../features/CommandPalette'

type Dialog =
  | { kind: 'input'; title: string; description: string; label: string; value: string; confirm: string; run: (value: string) => void | Promise<void> }
  | { kind: 'confirm'; title: string; description: string; confirm: string; danger?: boolean; run: () => void | Promise<void> }
  | { kind: 'snippet'; snippet?: Snippet; name: string; category: string; description: string; body: string }
  | { kind: 'goto'; value: string }

type Sidebar = 'explorer' | 'search' | 'snippets'
const fileSizeCache = new WeakMap<ProjectFile, number>()
function cachedFileSize(file: ProjectFile): number { const cached = fileSizeCache.get(file); if (cached !== undefined) return cached; const size = byteSize(file); fileSizeCache.set(file, size); return size }
function displayShortcut(value: string): string { return value.replace('Mod', /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘' : 'Ctrl') }
function languageName(path: string): string {
  const ext = extension(path)
  return ({ html: 'HTML', htm: 'HTML', css: 'CSS', js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript JSX', ts: 'TypeScript', tsx: 'TypeScript JSX', json: 'JSON', md: 'Markdown', markdown: 'Markdown', xml: 'XML', svg: 'SVG', yml: 'YAML', yaml: 'YAML' } as Record<string, string>)[ext] ?? 'Plain text'
}

export default function App() {
  const workspace = useWorkspace()
  const { project, settings } = workspace
  const [sidebar, setSidebar] = useState<Sidebar>('explorer')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileDrawer, setMobileDrawer] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(() => window.innerWidth >= 1050)
  const [bottomOpen, setBottomOpen] = useState(() => window.innerWidth >= 700)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [dashboardCreate, setDashboardCreate] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [editorMenu, setEditorMenu] = useState(false)
  const [projectMenu, setProjectMenu] = useState(false)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [dialogError, setDialogError] = useState('')
  const [busy, setBusy] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [cursor, setCursor] = useState({ line: 1, column: 1, selected: 0 })
  const [messages, setMessages] = useState<ConsoleMessage[]>([])
  const [previewDiagnostics, setPreviewDiagnostics] = useState<Diagnostic[]>([])
  const [diagnosticProject, setDiagnosticProject] = useState(project)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [previewWidth, setPreviewWidth] = useState(36)
  const [panelHeight, setPanelHeight] = useState(190)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const editorRef = useRef<EditorHandle>(null)
  const zipInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const backupInput = useRef<HTMLInputElement>(null)
  const settingsInput = useRef<HTMLInputElement>(null)
  const snippetInput = useRef<HTMLInputElement>(null)
  const importFolder = useRef('')
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()
  const draggedTab = useRef<string | null>(null)
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark)
  const activeFile = project?.files.find(file => file.id === project.activeFileId && file.kind === 'file') ?? null
  const editorMaxBytes = useMemo(() => Math.max(0, Math.min(MAX_FILE_SIZE, MAX_PROJECT_SIZE - (project?.files.reduce((sum, file) => sum + (file.id === activeFile?.id ? 0 : cachedFileSize(file)), 0) ?? 0))), [project?.files, activeFile?.id])
  const diagnostics = useMemo(() => diagnosticProject ? [...localDiagnostics(diagnosticProject), ...previewDiagnostics] : [], [diagnosticProject, previewDiagnostics])
  const toast = useCallback((message: string) => { setToastMessage(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToastMessage(''), 4200) }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const change = () => setSystemDark(media.matches)
    media.addEventListener('change', change); return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.documentElement.dataset.accent = settings.accent
    document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'normal'
  }, [dark, settings.accent, settings.reducedMotion])
  useEffect(() => { if (!workspace.loading && !project) setDashboardOpen(true) }, [workspace.loading, project])
  useEffect(() => { setMessages([]); setPreviewDiagnostics([]) }, [project?.id])
  useEffect(() => { const timer = setTimeout(() => setDiagnosticProject(project), 500); return () => clearTimeout(timer) }, [project?.id, project?.files, project?.entryFile])

  const updateContent = useCallback((fileId: string, content: string) => {
    if (content.length > MAX_FILE_SIZE) { toast('This file exceeds the 10 MB editing limit.'); return }
    workspace.mutate(current => ({ ...current, files: current.files.map(file => file.id === fileId ? { ...file, content, updatedAt: Date.now() } : file), updatedAt: Date.now() }))
  }, [workspace.mutate, toast])
  const command = useCallback((action: EditorCommand) => { void editorRef.current?.command(action) }, [])
  const formatActive = useCallback(async (): Promise<boolean> => {
    if (!project || !activeFile || activeFile.binary) { toast('Open a text file to format it.'); return false }
    const before = activeFile.content
    try {
      const formatted = await formatSource(activeFile.path, before, settings.tabSize)
      if (new TextEncoder().encode(formatted).length > editorMaxBytes) throw new Error('Formatted output would exceed the file or project size limit.')
      let applied = false
      workspace.mutate(current => {
        const now = current.files.find(file => file.id === activeFile.id)
        if (!now || now.content !== before) return current
        applied = true
        return { ...current, files: current.files.map(file => file.id === activeFile.id ? { ...file, content: formatted, updatedAt: Date.now() } : file), updatedAt: Date.now() }
      }, project.id)
      if (!applied) { toast('File changed while formatting. Try again.'); return false }
      toast('Document formatted with Prettier.'); return true
    } catch (error) { toast(error instanceof Error ? `Formatting failed: ${error.message}` : 'Formatting failed.'); return false }
  }, [project, activeFile, settings.tabSize, editorMaxBytes, workspace.mutate, toast])
  const manualSave = useCallback(async () => {
    if (settings.formatOnSave && activeFile && !activeFile.binary && supportsFormatting(activeFile.path)) { const ok = await formatActive(); if (!ok) return }
    const success = await workspace.saveProject()
    toast(success ? 'Project saved to this device.' : 'Save failed. Check your local storage.')
  }, [workspace.saveProject, settings.formatOnSave, activeFile, formatActive, toast])

  const openSidebar = (tab: Sidebar) => { setSidebar(tab); setSidebarOpen(true); setMobileDrawer(true) }
  const openFileInEditor = (file: ProjectFile) => { workspace.mutate(current => openFile(current, file.id)); setMobileDrawer(false) }
  const closeTab = async (fileId: string) => {
    if (workspace.dirtyIds.has(fileId)) { const success = await workspace.saveProject(); if (!success) { toast('Could not save this file. The tab remains open.'); return } }
    workspace.mutate(current => closeFile(current, fileId))
  }
  const saveExport = async (blob: Blob, filename: string, successMessage: string) => {
    try {
      setBusy('Choose where to save…')
      if (await downloadBlob(blob, filename, percent => setBusy(`Saving file… ${percent}%`))) toast(successMessage)
    } catch (error) { toast(error instanceof Error ? `Export failed: ${error.message}` : 'Export failed.') }
    finally { setBusy('') }
  }
  const saveFile = async (file: ProjectFile) => {
    try {
      setBusy('Choose where to save…')
      if (await downloadFile(file, percent => setBusy(`Saving file… ${percent}%`))) toast(`Exported ${basename(file.path)}.`)
    } catch (error) { toast(error instanceof Error ? `Export failed: ${error.message}` : 'Export failed.') }
    finally { setBusy('') }
  }
  const showDialog = (next: Dialog) => { setDialogError(''); setDialog(next) }
  const fileAction = (action: FileAction, file?: ProjectFile) => {
    if (!project) return
    if (action === 'import') { importFolder.current = file?.kind === 'folder' ? file.path : ''; fileInput.current?.click(); return }
    if (action === 'download' && file) { void saveFile(file); return }
    if (action === 'newFile' || action === 'newFolder') {
      const prefix = file?.kind === 'folder' ? `${file.path}/` : ''
      const folder = action === 'newFolder'
      showDialog({ kind: 'input', title: folder ? 'New folder' : 'New file', description: 'Use a project-relative path. Missing parent folders will be created.', label: folder ? 'FOLDER PATH' : 'FILE PATH', value: `${prefix}${folder ? 'new-folder' : 'new-file.html'}`, confirm: folder ? 'Create folder' : 'Create file', run: value => {
        workspace.mutate(current => { let next = addFile(current, value, '', folder ? 'folder' : 'file'); if (!folder) { const created = next.files.find(item => item.path === value.trim().replace(/\\/g, '/')); if (created) next = openFile(next, created.id) } return next })
        toast(folder ? 'Folder created.' : 'File created.')
      } }); return
    }
    if (!file) return
    if (action === 'delete') {
      showDialog({ kind: 'confirm', title: `Delete ${file.kind === 'folder' ? 'folder' : 'file'}?`, description: `“${file.path}”${file.kind === 'folder' ? ' and everything inside it' : ''} will be permanently removed from this project. This cannot be undone.`, confirm: 'Delete', danger: true, run: () => { workspace.mutate(current => deleteFile(current, file.id)); toast('Deleted from project.') } }); return
    }
    if (action === 'rename' || action === 'move') {
      showDialog({ kind: 'input', title: action === 'rename' ? 'Rename file or folder' : 'Move file or folder', description: 'Enter the full new project-relative path. Existing references in source code are not rewritten.', label: 'NEW PATH', value: file.path, confirm: action === 'rename' ? 'Rename' : 'Move', run: value => { workspace.mutate(current => moveFile(current, file.id, value)); toast(action === 'rename' ? 'Renamed successfully.' : 'Moved successfully.') } }); return
    }
    if (action === 'duplicate') {
      const path = file.path.replace(/(\.[^./]+)?$/, '-copy$1')
      showDialog({ kind: 'input', title: 'Duplicate file', description: 'Create a separate copy at a new project-relative path.', label: 'NEW FILE PATH', value: path, confirm: 'Duplicate', run: value => { workspace.mutate(current => duplicateFile(current, file.id, value)); toast('File duplicated.') } })
    }
  }
  const navigateSearch = (match: SearchMatch) => {
    const file = project?.files.find(item => item.id === match.fileId)
    if (!file) return
    openFileInEditor(file); setTimeout(() => editorRef.current?.goto(match.from, match.to), 50)
  }
  const jumpTo = (path: string, line: number) => {
    const clean = decodeURIComponent(path.replace(/^project:\/\/\//, ''))
    const file = project?.files.find(item => item.path === clean)
    if (!file) { toast('Source location is not available in this project.'); return }
    openFileInEditor(file); setTimeout(() => editorRef.current?.gotoLine(line, 1), 50)
  }
  const replaceAll = (matches: SearchMatch[], replacement: string) => {
    if (matches.length >= 5000) { toast('Too many matches. Narrow the search before replacing.'); return }
    showDialog({ kind: 'confirm', title: 'Replace across the project?', description: `This will replace ${matches.length} ${matches.length === 1 ? 'match' : 'matches'} in ${new Set(matches.map(item => item.fileId)).size} files. Review your search before continuing.`, confirm: 'Replace all', danger: true, run: () => { workspace.mutate(current => ({ ...current, files: replaceMatches(current.files, matches, replacement), updatedAt: Date.now() })); toast(`Replaced ${matches.length} matches.`) } })
  }
  const exportZip = async () => {
    if (!project) return
    try { setBusy('Preparing ZIP…'); const blob = await exportProject(project, percent => setBusy(`Preparing ZIP… ${percent}%`)); setBusy('Choose where to save…'); if (await downloadBlob(blob, `${project.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'project'}.zip`, percent => setBusy(`Saving file… ${percent}%`))) toast('Project ZIP exported.'); setProjectMenu(false) }
    catch (error) { toast(error instanceof Error ? error.message : 'Export failed.') }
    finally { setBusy('') }
  }
  const handleZip = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
    try {
      setBusy('Reading ZIP…')
      const imported = await importProjectZip(file, file.name.replace(/\.zip$/i, '') || 'Imported project', percent => setBusy(`Importing ZIP… ${percent}%`))
      const finish = async () => { await workspace.addProject(imported); setDashboardOpen(false); toast('Project imported as a new local project.') }
      if (workspace.projects.some(item => item.name.toLowerCase() === imported.name.toLowerCase())) showDialog({ kind: 'confirm', title: 'A project with this name exists', description: `“${imported.name}” is already in your workspace. Import this ZIP as a separate project? The existing project will not be overwritten.`, confirm: 'Import as a copy', run: finish })
      else await finish()
    }
    catch (error) { toast(error instanceof Error ? `Import failed: ${error.message}` : 'ZIP import failed.') }
    finally { setBusy('') }
  }
  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]; event.target.value = ''; if (!files.length || !project) return
    try {
      setBusy(`Importing ${files.length} file${files.length === 1 ? '' : 's'}…`)
      const imported = await Promise.all(files.map(file => importBrowserFile(file, `${importFolder.current ? `${importFolder.current}/` : ''}${file.webkitRelativePath || file.name}`)))
      const seen = new Set(project.files.map(item => item.path.toLowerCase()))
      let duplicates = 0
      for (const item of imported) { const key = item.path.toLowerCase(); if (seen.has(key)) duplicates++; else seen.add(key) }
      const apply = () => {
        let count = 0, skipped = 0
        workspace.mutate(current => {
          let next = current
          for (const file of imported) {
            if (next.files.some(item => item.path.toLowerCase() === file.path.toLowerCase())) { skipped++; continue }
            next = addFile(next, file.path, file.content, 'file', file.binary); count++
          }
          return next
        }, project.id)
        toast(`Imported ${count} file${count === 1 ? '' : 's'}${skipped ? `; skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''}.`)
      }
      if (duplicates) showDialog({ kind: 'confirm', title: 'Duplicate files found', description: `${duplicates} file${duplicates === 1 ? '' : 's'} already exist or have duplicate names. Import the remaining files and skip duplicates? Existing files will not be overwritten.`, confirm: 'Import remaining', run: apply })
      else apply()
    } catch (error) { toast(error instanceof Error ? `Import failed: ${error.message}` : 'File import failed.') }
    finally { setBusy('') }
  }
  const backup = () => { try { void saveExport(createBackup(workspace.projects, settings, workspace.snippets), `21-code-backup-${new Date().toISOString().slice(0, 10)}.json`, 'Backup exported.') } catch (error) { toast(error instanceof Error ? error.message : 'Backup failed.') } }
  const handleBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
    try {
      setBusy('Validating backup…'); const data = await parseBackup(file); setBusy('')
      showDialog({ kind: 'confirm', title: 'Restore backup?', description: `Restore ${data.projects.length} project${data.projects.length === 1 ? '' : 's'} as new copies and import valid settings and custom snippets. Existing projects will not be overwritten.`, confirm: 'Restore backup', run: async () => {
        setBusy('Restoring backup…')
        try {
          for (const item of data.projects) await workspace.addProject(item)
          if (data.settings) workspace.updateSettings(validateSettings(data.settings))
          let existing = [...builtinSnippets, ...workspace.snippets]
          for (const raw of data.snippets) { try { const snippet = validateSnippet(raw, existing); await workspace.saveSnippet(snippet); existing = [...existing, snippet] } catch { /* invalid or duplicate snippets are skipped */ } }
          toast('Backup restored. Invalid or duplicate snippets were skipped.')
        } finally { setBusy('') }
      } })
    } catch (error) { setBusy(''); toast(error instanceof Error ? `Restore failed: ${error.message}` : 'Invalid backup.') }
  }
  const handleSettingsImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
    try { if (file.size > 100_000) throw new Error('Settings file is too large.'); workspace.updateSettings(validateSettings(JSON.parse(await file.text()))); toast('Settings imported.') } catch (error) { toast(error instanceof Error ? `Settings import failed: ${error.message}` : 'Invalid settings.') }
  }
  const handleSnippetsImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
    try {
      if (file.size > 2_000_000) throw new Error('Snippets file is too large.')
      const values: unknown = JSON.parse(await file.text())
      if (!Array.isArray(values) || values.length > 200) throw new Error('Expected an array of up to 200 snippets.')
      let existing = [...builtinSnippets, ...workspace.snippets], count = 0
      for (const raw of values) { try { const item = validateSnippet(raw as Partial<Snippet>, existing); await workspace.saveSnippet(item); existing = [...existing, item]; count++ } catch { /* report skipped count below */ } }
      toast(`Imported ${count} snippets; skipped ${values.length - count} invalid or duplicate entries.`)
    } catch (error) { toast(error instanceof Error ? `Snippet import failed: ${error.message}` : 'Invalid snippets.') }
  }
  const startResize = (kind: 'sidebar' | 'preview' | 'bottom', event: React.PointerEvent) => {
    if (window.innerWidth < 900) return
    event.preventDefault()
    const x = event.clientX, y = event.clientY, start = kind === 'sidebar' ? sidebarWidth : kind === 'preview' ? previewWidth : panelHeight
    const move = (next: PointerEvent) => {
      if (kind === 'sidebar') setSidebarWidth(Math.min(360, Math.max(190, start + next.clientX - x)))
      else if (kind === 'preview') setPreviewWidth(Math.min(55, Math.max(25, start - (next.clientX - x) / window.innerWidth * 100)))
      else setPanelHeight(Math.min(400, Math.max(110, start - (next.clientY - y))))
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const paletteActions: PaletteAction[] = [
    { id: 'save', label: 'Save project', shortcut: settings.shortcuts.save, run: () => void manualSave() },
    { id: 'projects', label: 'Open project dashboard', detail: 'Create, import, or open a project', run: () => setDashboardOpen(true) },
    { id: 'new-file', label: 'New file', run: () => fileAction('newFile') },
    { id: 'new-folder', label: 'New folder', run: () => fileAction('newFolder') },
    { id: 'import', label: 'Import files', run: () => fileAction('import') },
    { id: 'zip', label: 'Export project as ZIP', run: () => void exportZip() },
    { id: 'preview', label: 'Toggle live preview', shortcut: settings.shortcuts.preview, run: () => setPreviewOpen(value => !value) },
    { id: 'find', label: 'Find and replace in file', shortcut: 'Ctrl+F', run: () => command('search') },
    { id: 'search', label: 'Search across project', run: () => openSidebar('search') },
    { id: 'goto', label: 'Go to line and column', shortcut: 'Ctrl+G', run: () => showDialog({ kind: 'goto', value: `${cursor.line}:${cursor.column}` }) },
    { id: 'format', label: 'Format document with Prettier', run: () => void formatActive() },
    { id: 'wrap', label: 'Toggle word wrap', run: () => workspace.updateSettings({ ...settings, wordWrap: !settings.wordWrap }) },
    { id: 'snippets', label: 'Browse snippets', run: () => openSidebar('snippets') },
    { id: 'comment', label: 'Toggle line comment', shortcut: 'Ctrl+/', run: () => command('comment') },
    { id: 'duplicate', label: 'Duplicate line', run: () => command('duplicateLine') },
    { id: 'delete-line', label: 'Delete line', run: () => command('deleteLine') },
    { id: 'up', label: 'Move line up', run: () => command('moveLineUp') },
    { id: 'down', label: 'Move line down', run: () => command('moveLineDown') },
    { id: 'match', label: 'Find matching bracket', run: () => command('matchingBracket') },
    { id: 'settings', label: 'Open settings and help', run: () => setSettingsOpen(true) },
  ]
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const shortcut = shortcutFromEvent(event)
      if (shortcut === settings.shortcuts.save) { event.preventDefault(); void manualSave() }
      else if (shortcut === settings.shortcuts.preview) { event.preventDefault(); setPreviewOpen(value => !value) }
      else if (shortcut === settings.shortcuts.palette) { event.preventDefault(); setPaletteOpen(true) }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') { event.preventDefault(); showDialog({ kind: 'goto', value: `${cursor.line}:${cursor.column}` }) }
      else if (event.key === 'Escape') { setPaletteOpen(false); setEditorMenu(false); setProjectMenu(false); setMobileDrawer(false) }
    }
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener)
  }, [settings.shortcuts, manualSave, cursor.line, cursor.column])

  if (workspace.loading) return <div className="loading-screen"><Logo /><div className="loading-spinner" /><span>Opening your workspace…</span></div>
  const statusLabel = workspace.status === 'saved' ? 'All changes saved' : workspace.status === 'saving' ? 'Saving changes…' : workspace.status === 'unsaved' ? 'Unsaved changes' : 'Save failed'
  return <div className={`app ${previewOpen ? 'preview-is-open' : ''} ${bottomOpen ? 'bottom-is-open' : ''}`} style={{ '--sidebar-width': `${sidebarWidth}px`, '--preview-width': `${previewWidth}%`, '--panel-height': `${panelHeight}px` } as React.CSSProperties}>
    <header className="topbar"><button className="mobile-menu-button icon-button" aria-label="Open explorer" onClick={() => setMobileDrawer(true)}><Menu size={21} /></button><Logo /><div className="topbar-divider" /><button className="project-switcher" onClick={() => setDashboardOpen(true)}><span className="workspace-label">WORKSPACE</span><ChevronRight size={14} /><span className="project-name">{project?.name ?? 'Your projects'}</span><ChevronDown size={14} /></button><div className="top-project-actions"><button className="project-quick-trigger" aria-label="Project actions" title="Project actions" onClick={() => setProjectMenu(!projectMenu)}><MoreHorizontal size={16} /></button>{projectMenu && project && <div className="project-quick-menu"><button onClick={() => { setDashboardOpen(true); setProjectMenu(false) }}><LayoutDashboard size={15} /> All projects</button><button onClick={() => { zipInput.current?.click(); setProjectMenu(false) }}><Upload size={15} /> Import ZIP</button><button onClick={() => void exportZip()}><Download size={15} /> Export project ZIP</button><button onClick={() => { backup(); setProjectMenu(false) }}><Copy size={15} /> Backup all projects</button><button onClick={() => { setPaletteOpen(true); setProjectMenu(false) }}><Command size={15} /> Command palette</button></div>}</div><span className={`save-status ${workspace.status}`} title={statusLabel}>{workspace.status === 'saved' ? <CheckCircle2 size={14} /> : workspace.status === 'error' ? <AlertCircle size={14} /> : <span className="status-spinner" />}<span>{statusLabel}</span></span>
      <div className="topbar-spacer" /><div className="topbar-actions"><IconButton label="Undo" title="Undo (Ctrl+Z)" onClick={() => command('undo')}><Undo2 size={17} /></IconButton><IconButton label="Redo" title="Redo (Ctrl+Shift+Z)" onClick={() => command('redo')}><Redo2 size={17} /></IconButton><span className="toolbar-divider" /><IconButton label="Save project" title={`Save (${settings.shortcuts.save})`} onClick={() => void manualSave()}><Save size={17} /></IconButton><button aria-label="Live preview" aria-pressed={previewOpen} className={`preview-button ${previewOpen ? 'selected' : ''}`} onClick={() => setPreviewOpen(!previewOpen)}><Play size={15} fill="currentColor" /><span>Live preview</span><kbd>{displayShortcut(settings.shortcuts.preview)}</kbd></button><IconButton label="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={18} /></IconButton><IconButton label="Command palette" title={`Command palette (${settings.shortcuts.palette})`} className="command-button" onClick={() => setPaletteOpen(true)}><Command size={17} /></IconButton></div>
    </header>
    {workspace.storageError && <div className="storage-warning"><AlertCircle size={16} /><span>{workspace.storageError}</span><button onClick={backup}>Export backup</button></div>}
    <div className="workbench">
      <nav className="activity-bar" aria-label="Workspace navigation"><div className="activity-main"><button className={sidebarOpen && sidebar === 'explorer' ? 'active' : ''} aria-label="Explorer" title="Explorer" onClick={() => openSidebar('explorer')}><PanelLeft size={21} /></button><button className={sidebarOpen && sidebar === 'search' ? 'active' : ''} aria-label="Search project" title="Search project" onClick={() => openSidebar('search')}><Search size={21} /></button><button className={sidebarOpen && sidebar === 'snippets' ? 'active' : ''} aria-label="Snippets" title="Snippets" onClick={() => openSidebar('snippets')}><Braces size={21} /></button><button aria-label="Project dashboard" title="Projects" onClick={() => setDashboardOpen(true)}><LayoutDashboard size={20} /></button><span className="activity-separator" /><button aria-label="Command palette" title="Command palette" onClick={() => setPaletteOpen(true)}><Command size={20} /></button></div><div className="activity-bottom"><button aria-label="Help" title="Help and settings" onClick={() => setSettingsOpen(true)}><CircleHelp size={20} /></button><button aria-label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={20} /></button></div></nav>
      {mobileDrawer && <div className="drawer-backdrop" onClick={() => setMobileDrawer(false)} />}
      {project && <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'} ${mobileDrawer ? 'mobile-open' : ''}`}>
        <div className="mobile-sidebar-nav" aria-label="Mobile workspace navigation"><button className={sidebar === 'explorer' ? 'active' : ''} onClick={() => setSidebar('explorer')} aria-label="Explorer"><PanelLeft size={17} /><span>Files</span></button><button className={sidebar === 'search' ? 'active' : ''} onClick={() => setSidebar('search')} aria-label="Search project"><Search size={17} /><span>Search</span></button><button className={sidebar === 'snippets' ? 'active' : ''} onClick={() => setSidebar('snippets')} aria-label="Snippets"><Braces size={17} /><span>Snippets</span></button><button onClick={() => { setMobileDrawer(false); setDashboardOpen(true) }} aria-label="Project dashboard"><LayoutDashboard size={17} /><span>Projects</span></button><button onClick={() => setMobileDrawer(false)} aria-label="Close navigation"><X size={17} /></button></div>
        {sidebar === 'explorer' ? <Explorer project={project} dirtyIds={workspace.dirtyIds} settings={settings} onOpen={openFileInEditor} onAction={fileAction} onSort={() => workspace.updateSettings({ ...settings, explorerSort: settings.explorerSort === 'name' ? 'type' : 'name' })} onClose={() => { setSidebarOpen(false); setMobileDrawer(false) }} onNewProject={() => { setDashboardCreate(true); setDashboardOpen(true); setMobileDrawer(false) }} onProjects={() => { setDashboardCreate(false); setDashboardOpen(true); setMobileDrawer(false) }} onImportZip={() => zipInput.current?.click()} /> : sidebar === 'search' ? <SearchPanel project={project} onNavigate={navigateSearch} onReplaceAll={replaceAll} onReplaceOne={(match, replacement) => { try { workspace.mutate(current => ({ ...current, files: replaceMatches(current.files, [match], replacement), updatedAt: Date.now() })); toast('Match replaced.') } catch (error) { toast(error instanceof Error ? error.message : 'Replace failed.') } }} /> : <SnippetsPanel snippets={workspace.snippets} onInsert={snippet => { if (!activeFile || activeFile.binary) { toast('Open a text file first.'); return } editorRef.current?.insert(snippet.body); setMobileDrawer(false); toast(`Inserted ${snippet.name}.`) }} onEdit={snippet => showDialog({ kind: 'snippet', snippet, name: snippet?.name ?? '', category: snippet?.category ?? '', description: snippet?.description ?? '', body: snippet?.body ?? '' })} onDelete={snippet => showDialog({ kind: 'confirm', title: 'Delete snippet?', description: `“${snippet.name}” will be permanently removed.`, confirm: 'Delete snippet', danger: true, run: async () => { await workspace.removeSnippet(snippet.id); toast('Snippet deleted.') } })} onImport={() => snippetInput.current?.click()} onExport={() => void saveExport(new Blob([JSON.stringify(workspace.snippets, null, 2)], { type: 'application/json' }), '21-code-snippets.json', 'Custom snippets exported.')} />}
      </aside>}
      {project && sidebarOpen && <div className="resize-handle sidebar-resize" role="separator" aria-label="Resize explorer" onPointerDown={event => startResize('sidebar', event)} />}
      <main className="workspace-main">{project ? <>
        <div className="workspace-body"><div className="editor-column"><div className="tabs-row" role="tablist" aria-label="Open files">{project.openTabs.map(fileId => { const file = project.files.find(item => item.id === fileId); if (!file) return null; const active = file.id === project.activeFileId; return <div key={file.id} role="tab" aria-selected={active} draggable className={`file-tab ${active ? 'active' : ''}`} onDragStart={() => { draggedTab.current = file.id }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const from = draggedTab.current; if (from && from !== file.id) workspace.mutate(current => { const tabs = [...current.openTabs]; tabs.splice(tabs.indexOf(from), 1); tabs.splice(tabs.indexOf(file.id), 0, from); return { ...current, openTabs: tabs } }); draggedTab.current = null }}><button className="tab-name" onClick={() => openFileInEditor(file)} title={file.path}><FileIcon path={file.path} /><span>{basename(file.path)}</span>{workspace.dirtyIds.has(file.id) && <i className="dirty-dot" />}</button><button className="tab-close" aria-label={`Close ${basename(file.path)}`} onClick={() => void closeTab(file.id)}><X size={13} /></button></div> })}<button className="tab-add" aria-label="New file" title="New file" onClick={() => fileAction('newFile')}><Plus size={16} /></button><div className="tabs-spacer" /><button className="tab-action" aria-label="Toggle explorer" title="Toggle explorer" onClick={() => setSidebarOpen(!sidebarOpen)}><PanelLeft size={16} /></button></div>
          <div className="editor-breadcrumb"><div><button onClick={() => setDashboardOpen(true)}>{project.name}</button>{activeFile && <><ChevronRight size={13} />{dirname(activeFile.path) && <><span>{dirname(activeFile.path)}</span><ChevronRight size={13} /></>}<FileIcon path={activeFile.path} /><strong>{basename(activeFile.path)}</strong></>}</div><div className="editor-breadcrumb-actions"><button title="Find in file" aria-label="Find in file" onClick={() => command('search')}><Search size={15} /></button><button title="Toggle word wrap" aria-label="Toggle word wrap" className={settings.wordWrap ? 'active' : ''} onClick={() => workspace.updateSettings({ ...settings, wordWrap: !settings.wordWrap })}><WrapText size={15} /></button><div className="relative"><button aria-label="Editor actions" title="Editor actions" onClick={() => setEditorMenu(!editorMenu)}><MoreHorizontal size={17} /></button>{editorMenu && <div className="editor-action-menu">{[['Format document','format'],['Go to line…','goto'],['Duplicate line','duplicateLine'],['Delete line','deleteLine'],['Move line up','moveLineUp'],['Move line down','moveLineDown'],['Toggle comment','comment'],['Select all','selectAll'],['Copy','copy'],['Cut','cut'],['Paste','paste'],['Find matching bracket','matchingBracket']].map(([label, action]) => <button key={action} onClick={() => { setEditorMenu(false); if (action === 'format') void formatActive(); else if (action === 'goto') showDialog({ kind: 'goto', value: `${cursor.line}:${cursor.column}` }); else command(action as EditorCommand) }}>{label}</button>)}</div>}</div></div></div>
          <div className="editor-area"><div className={`code-mount ${!activeFile || activeFile.binary ? 'hidden' : ''}`}><CodeEditor ref={editorRef} file={activeFile} settings={settings} dark={dark} maxBytes={editorMaxBytes} onChange={updateContent} onCursor={(line, column, selected) => setCursor({ line, column, selected })} onError={toast} /></div>{!activeFile ? <div className="editor-empty"><div className="editor-empty-logo"><Logo compact /></div><h2>Your space to create.</h2><p>Open a file from the explorer, or start something new.</p><div><button className="secondary-button" onClick={() => fileAction('newFile')}><FilePlus2 size={15} /> New file</button><button className="secondary-button" onClick={() => setDashboardOpen(true)}><FolderOpen size={15} /> Open project</button></div><span><kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>P</kbd> &nbsp; Open command palette</span></div> : activeFile.binary && <div className="editor-empty asset-details"><div className="editor-empty-logo"><FileIcon path={activeFile.path} /></div><h2>{basename(activeFile.path)}</h2><p>Binary asset · {humanSize(byteSize(activeFile))} · {activeFile.mime}</p><div><button className="secondary-button" onClick={() => { setPreviewOpen(true); toast('Select “Current file” in the preview panel.') }}><Play size={14} /> View asset</button><button className="secondary-button" onClick={() => void saveFile(activeFile)}><Download size={15} /> Download</button></div></div>}</div>
          <AccessoryBar insert={(text, pair) => editorRef.current?.insert(text, pair)} command={command} save={() => void manualSave()} preview={() => setPreviewOpen(true)} />
          {bottomOpen && <><div className="resize-handle bottom-resize" role="separator" aria-label="Resize bottom panel" onPointerDown={event => startResize('bottom', event)} /><BottomPanel messages={messages} diagnostics={diagnostics} onClear={() => setMessages([])} onClose={() => setBottomOpen(false)} onJump={jumpTo} toast={toast} /></>}
        </div>
        {previewOpen && <><div className="resize-handle preview-resize" role="separator" aria-label="Resize preview" onPointerDown={event => startResize('preview', event)} /><div className="preview-container"><PreviewPanel project={project} activeFile={activeFile} settings={settings} onEntryChange={path => workspace.mutate(current => ({ ...current, entryFile: path, updatedAt: Date.now() }))} onDiagnostics={setPreviewDiagnostics} onMessage={message => setMessages(current => [...current.slice(-499), message])} onClose={() => setPreviewOpen(false)} toast={toast} /></div></>}
        </div>
      </> : <div className="editor-empty"><Logo /><h2>Your workspace is ready.</h2><p>Create a project or import an existing ZIP to get started.</p><button className="primary-button" onClick={() => setDashboardOpen(true)}><Plus size={16} /> Open projects</button></div>}</main>
    </div>
    <footer className="statusbar"><div><button className="status-local" onClick={() => setDashboardOpen(true)}><Code2 size={14} /> <span>LOCAL</span></button><button onClick={() => setBottomOpen(!bottomOpen)}><AlertCircle size={13} /> {diagnostics.filter(item => item.severity === 'error').length}<span className="status-gap"><AlertCircle size={13} /> {diagnostics.filter(item => item.severity === 'warning').length}</span></button><span className="status-ready"><i /> {workspace.status === 'saved' ? 'Ready' : statusLabel}</span></div><div><button onClick={() => setBottomOpen(!bottomOpen)} title="Toggle console"><TerminalSquare size={14} /> <span>Console</span></button><span className="status-separator" />{activeFile && <><button onClick={() => showDialog({ kind: 'goto', value: `${cursor.line}:${cursor.column}` })}>Ln {cursor.line}, Col {cursor.column}{cursor.selected ? ` (${cursor.selected} selected)` : ''}</button><button onClick={() => setSettingsOpen(true)}>Spaces: {settings.tabSize}</button><span className="status-optional">{activeFile.content.includes('\r\n') ? 'CRLF' : 'LF'}</span><span className="status-optional">{activeFile.binary ? 'Binary' : 'UTF-8'}</span><span className="status-language">{languageName(activeFile.path)}</span></>}</div></footer>
    {dashboardOpen && <Dashboard projects={workspace.projects} recentLimit={settings.recentLimit} initialCreate={dashboardCreate} activeId={workspace.activeId} onClose={() => { setDashboardOpen(false); setDashboardCreate(false) }} onOpen={workspace.openProject} onCreate={async (name, templateId) => { await workspace.addProject(createProject(name, templateId)); toast('Project created and saved locally.') }} onImport={() => zipInput.current?.click()} onRename={item => showDialog({ kind: 'input', title: 'Rename project', description: 'This changes the project name, not its files.', label: 'PROJECT NAME', value: item.name, confirm: 'Rename', run: value => { const clean = value.trim(); if (!clean || clean.length > 80) throw new Error('Enter a name between 1 and 80 characters.'); workspace.mutate(current => ({ ...current, name: clean, updatedAt: Date.now() }), item.id); toast('Project renamed.') } })} onDuplicate={item => { void workspace.duplicateProject(item.id).then(() => toast('Project duplicated.')).catch(error => toast(String(error))) }} onPin={item => workspace.mutate(current => ({ ...current, pinned: !current.pinned }), item.id)} onArchive={item => workspace.mutate(current => ({ ...current, archived: !current.archived }), item.id)} onDelete={item => showDialog({ kind: 'confirm', title: 'Delete project?', description: `“${item.name}” and all of its files will be permanently deleted from this device. Export a ZIP or backup first.`, confirm: 'Delete project', danger: true, run: async () => { await workspace.removeProject(item.id); toast('Project deleted.') } })} />}
    {settingsOpen && <SettingsDialog settings={settings} onChange={workspace.updateSettings} onClose={() => setSettingsOpen(false)} onBackup={backup} onRestore={() => backupInput.current?.click()} onSettingsExport={() => void saveExport(new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' }), '21-code-settings.json', 'Settings exported.')} onSettingsImport={() => settingsInput.current?.click()} onClear={() => showDialog({ kind: 'confirm', title: 'Clear all projects?', description: 'This permanently deletes every local project and its files. Export a backup first. Settings and snippets will be kept.', confirm: 'Delete all projects', danger: true, run: async () => { for (const item of workspace.projects) await workspace.removeProject(item.id); setSettingsOpen(false); setDashboardOpen(true); toast('All projects deleted.') } })} onReset={() => showDialog({ kind: 'confirm', title: 'Reset settings?', description: 'All editor and appearance preferences will return to their defaults.', confirm: 'Reset settings', run: () => { workspace.updateSettings(defaultSettings); toast('Settings reset.') } })} />}
    {paletteOpen && <CommandPalette actions={paletteActions} onClose={() => setPaletteOpen(false)} />}
    {dialog && <Modal title={dialog.kind === 'input' || dialog.kind === 'confirm' ? dialog.title : dialog.kind === 'goto' ? 'Go to line' : dialog.snippet ? 'Edit snippet' : 'Create snippet'} subtitle={dialog.kind === 'input' || dialog.kind === 'confirm' ? dialog.description : dialog.kind === 'goto' ? 'Enter a line and optional column, for example 12:4.' : 'Save a reusable piece of code on this device.'} onClose={() => setDialog(null)}><form className="dialog-body" onSubmit={async event => { event.preventDefault(); setDialogError(''); try { if (dialog.kind === 'input') await dialog.run(dialog.value); else if (dialog.kind === 'confirm') await dialog.run(); else if (dialog.kind === 'goto') { const match = /^(\d+)(?::(\d+))?$/.exec(dialog.value.trim()); if (!match || Number(match[1]) < 1 || (match[2] && Number(match[2]) < 1)) throw new Error('Enter a valid line and column.'); editorRef.current?.gotoLine(Number(match[1]), Number(match[2] ?? 1)) } else { const snippet = validateSnippet(dialog, [...builtinSnippets, ...workspace.snippets], dialog.snippet?.id); await workspace.saveSnippet(snippet); toast('Snippet saved.') } setDialog(null) } catch (error) { setDialogError(error instanceof Error ? error.message : 'Something went wrong.') } }}>
      {dialog.kind === 'input' && <label className="field-label">{dialog.label}<input autoFocus value={dialog.value} onChange={event => setDialog({ ...dialog, value: event.target.value })} /></label>}
      {dialog.kind === 'goto' && <label className="field-label">LINE : COLUMN<input autoFocus value={dialog.value} onChange={event => setDialog({ ...dialog, value: event.target.value })} /></label>}
      {dialog.kind === 'snippet' && <><label className="field-label">NAME<input autoFocus value={dialog.name} onChange={event => setDialog({ ...dialog, name: event.target.value })} /></label><label className="field-label">CATEGORY<input value={dialog.category} onChange={event => setDialog({ ...dialog, category: event.target.value })} /></label><label className="field-label">DESCRIPTION<input value={dialog.description} onChange={event => setDialog({ ...dialog, description: event.target.value })} /></label><label className="field-label">CODE<textarea rows={7} value={dialog.body} onChange={event => setDialog({ ...dialog, body: event.target.value })} /></label></>}
      {dialogError && <p className="form-error">{dialogError}</p>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setDialog(null)}>Cancel</button><button className={dialog.kind === 'confirm' && dialog.danger ? 'danger-button' : 'primary-button'}>{dialog.kind === 'input' || dialog.kind === 'confirm' ? dialog.confirm : dialog.kind === 'goto' ? 'Go to line' : 'Save snippet'}</button></div></form></Modal>}
    {toastMessage && <div className="toast" role="status"><Check size={16} /><span>{toastMessage}</span><button aria-label="Dismiss notification" onClick={() => setToastMessage('')}><X size={14} /></button></div>}
    {busy && <div className="busy-overlay" role="status"><div className="loading-spinner" />{busy}</div>}
    <input ref={zipInput} type="file" accept=".zip,application/zip" hidden onChange={event => void handleZip(event)} /><input ref={fileInput} type="file" multiple hidden onChange={event => void handleFiles(event)} /><input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={event => void handleBackup(event)} /><input ref={settingsInput} type="file" accept=".json,application/json" hidden onChange={event => void handleSettingsImport(event)} /><input ref={snippetInput} type="file" accept=".json,application/json" hidden onChange={event => void handleSnippetsImport(event)} />

  </div>
}
