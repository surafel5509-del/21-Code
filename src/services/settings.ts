import { defaultSettings, type Settings } from '../types'

export function validateSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') throw new Error('Settings must be a JSON object.')
  const input = value as Partial<Settings>
  const choices = <T extends string>(item: unknown, values: T[], fallback: T): T => values.includes(item as T) ? item as T : fallback
  const number = (item: unknown, min: number, max: number, fallback: number) => typeof item === 'number' && Number.isFinite(item) ? Math.min(max, Math.max(min, item)) : fallback
  const boolean = (item: unknown, fallback: boolean) => typeof item === 'boolean' ? item : fallback
  const shortcuts = input.shortcuts && typeof input.shortcuts === 'object' ? input.shortcuts : defaultSettings.shortcuts
  const shortcut = (item: unknown, fallback: string) => typeof item === 'string' && /^(?:(?:Mod|Alt|Shift)\+)+(?:[A-Z0-9]|Enter|Space|Escape)$/.test(item) ? item : fallback
  return {
    theme: choices(input.theme, ['dark','light','system'], defaultSettings.theme),
    accent: choices(input.accent, ['cyan','violet','green'], defaultSettings.accent),
    fontFamily: choices(input.fontFamily, ['mono','system','serif'], defaultSettings.fontFamily),
    fontSize: number(input.fontSize, 11, 24, defaultSettings.fontSize), lineHeight: number(input.lineHeight, 1.2, 2.2, defaultSettings.lineHeight),
    tabSize: Math.round(number(input.tabSize, 2, 8, defaultSettings.tabSize)), wordWrap: boolean(input.wordWrap, defaultSettings.wordWrap),
    autosaveMs: number(input.autosaveMs, 300, 10000, defaultSettings.autosaveMs), autoPreview: boolean(input.autoPreview, defaultSettings.autoPreview),
    previewDebounceMs: number(input.previewDebounceMs, 300, 5000, defaultSettings.previewDebounceMs), formatOnSave: boolean(input.formatOnSave, defaultSettings.formatOnSave),
    explorerSort: choices(input.explorerSort, ['name','type'], defaultSettings.explorerSort), recentLimit: number(input.recentLimit, 3, 50, defaultSettings.recentLimit),
    reducedMotion: boolean(input.reducedMotion, defaultSettings.reducedMotion),
    shortcuts: { save: shortcut(shortcuts.save, defaultSettings.shortcuts.save), preview: shortcut(shortcuts.preview, defaultSettings.shortcuts.preview), palette: shortcut(shortcuts.palette, defaultSettings.shortcuts.palette) },
  }
}
export function shortcutFromEvent(event: KeyboardEvent | React.KeyboardEvent): string | null {
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Mod')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  const key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key
  if (!parts.length || !/^(?:[A-Z0-9]|Enter|Space|Escape)$/.test(key)) return null
  return [...parts, key].join('+')
}
