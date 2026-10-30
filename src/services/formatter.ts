import { extension } from './filesystem'

function parserFor(path: string): string | null {
  const ext = extension(path)
  return ['html', 'htm', 'svg'].includes(ext) ? 'html' : ext === 'css' ? 'css' : ['js','mjs','cjs','jsx'].includes(ext) ? 'babel' : ['ts','tsx'].includes(ext) ? 'typescript' : ext === 'json' ? 'json' : ['md','markdown'].includes(ext) ? 'markdown' : null
}
export function supportsFormatting(path: string): boolean { return parserFor(path) !== null }
export async function formatSource(path: string, source: string, tabSize: number): Promise<string> {
  const parser = parserFor(path)
  if (!parser) throw new Error(`Formatting is not available for .${extension(path) || 'txt'} files.`)
  const prettier = await import('prettier/standalone')
  // Only fetch the plugins needed for this format; HTML also needs JS and CSS for embedded blocks.
  const plugins = parser === 'html' ? await Promise.all([import('prettier/plugins/html'), import('prettier/plugins/postcss'), import('prettier/plugins/babel'), import('prettier/plugins/estree')])
    : parser === 'css' ? [await import('prettier/plugins/postcss')]
    : parser === 'typescript' ? await Promise.all([import('prettier/plugins/typescript'), import('prettier/plugins/estree')])
    : parser === 'markdown' ? [await import('prettier/plugins/markdown')]
    : await Promise.all([import('prettier/plugins/babel'), import('prettier/plugins/estree')])
  return prettier.format(source, { parser, plugins, tabWidth: tabSize, printWidth: 100 })
}
