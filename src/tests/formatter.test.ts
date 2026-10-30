// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { formatSource, supportsFormatting } from '../services/formatter'

describe('Prettier document formatting', () => {
  it('formats supported HTML, CSS, JavaScript, TypeScript, JSON and Markdown', async () => {
    expect(await formatSource('index.html', '<html><head><title>Hi</title></head><body><p>Hi</p></body></html>', 2)).toContain('\n')
    expect(await formatSource('styles.css', 'h1{color:red}', 2)).toContain('color: red;')
    expect(await formatSource('script.js', 'const x={a:1}', 2)).toContain('const x = { a: 1 };')
    expect(await formatSource('main.ts', 'const x:number=1', 2)).toContain('const x: number = 1;')
    expect(await formatSource('data.json', '{"a":1}', 2)).toContain('"a": 1')
    expect(await formatSource('README.md', '# Hello\n\nSome text', 2)).toContain('# Hello')
  })
  it('reports unsupported or malformed documents', async () => {
    expect(supportsFormatting('file.yml')).toBe(false)
    await expect(formatSource('file.yml', 'key: value', 2)).rejects.toThrow(/not available/)
    await expect(formatSource('broken.json', '{bad}', 2)).rejects.toThrow()
  })
})
