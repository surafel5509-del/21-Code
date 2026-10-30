import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Braces, CopyPlus, IndentDecrease, IndentIncrease, Play, Redo2, Save, TextSelect, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { EditorCommand } from './CodeEditor'

interface Props { insert: (text: string, pair?: boolean) => void; command: (command: EditorCommand) => void; save: () => void; preview: () => void }
export function AccessoryBar({ insert, command, save, preview }: Props) {
  const button = (label: string, content: ReactNode, action: () => void, className = '') => <button key={label} className={className} aria-label={label} title={label} onPointerDown={event => event.preventDefault()} onClick={action}>{content}</button>
  return <div className="accessory-bar" aria-label="Coding accessory toolbar">
    {button('Indent', 'Tab', () => command('indent'), 'accessory-wide')}
    {button('Insert braces', '{}', () => insert('{}', true))}
    {button('Insert brackets', '[]', () => insert('[]', true))}
    {button('Insert parentheses', '()', () => insert('()', true))}
    {button('Insert double quotes', '""', () => insert('""', true))}
    {button('Insert single quotes', "''", () => insert("''", true))}
    {button('Insert backticks', '``', () => insert('``', true))}
    {[';', ':', ',', '.', '=', '+', '-', '/', '\\', '<', '>'].map(char => button(`Insert ${char}`, char, () => insert(char)))}
    <span className="accessory-divider" />
    {button('Move cursor left', <ArrowLeft size={16} />, () => command('left'))}{button('Move cursor right', <ArrowRight size={16} />, () => command('right'))}{button('Move cursor up', <ArrowUp size={16} />, () => command('up'))}{button('Move cursor down', <ArrowDown size={16} />, () => command('down'))}
    {button('Indent line', <IndentIncrease size={16} />, () => command('indent'))}{button('Outdent line', <IndentDecrease size={16} />, () => command('outdent'))}{button('Select line', <TextSelect size={16} />, () => command('selectLine'))}{button('Duplicate line', <CopyPlus size={16} />, () => command('duplicateLine'))}{button('Find matching bracket', <Braces size={16} />, () => command('matchingBracket'))}
    {button('Undo', <Undo2 size={16} />, () => command('undo'))}{button('Redo', <Redo2 size={16} />, () => command('redo'))}{button('Save project', <Save size={16} />, save)}{button('Open preview', <Play size={16} />, preview)}
  </div>
}
