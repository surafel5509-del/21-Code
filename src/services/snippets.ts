import type { Snippet } from '../types'

const items: Array<[string, string, string, string]> = [
  ['HTML boilerplate', 'HTML', 'A complete HTML document', '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>'],
  ['Metadata', 'HTML', 'Common document metadata', '<meta name="description" content="">\n<meta name="theme-color" content="#ffffff">'],
  ['Link', 'HTML', 'An accessible hyperlink', '<a href="https://example.com">Link text</a>'],
  ['Image', 'HTML', 'Responsive image with alternative text', '<img src="./assets/image.png" alt="Description" loading="lazy">'],
  ['Form', 'HTML', 'A simple labeled form', '<form>\n  <label for="name">Name</label>\n  <input id="name" name="name" required>\n  <button type="submit">Submit</button>\n</form>'],
  ['Table', 'HTML', 'A semantic table', '<table>\n  <thead><tr><th scope="col">Name</th><th scope="col">Value</th></tr></thead>\n  <tbody><tr><td>Item</td><td>Value</td></tr></tbody>\n</table>'],
  ['Semantic layout', 'HTML', 'Header, main and footer', '<header><nav aria-label="Main navigation"></nav></header>\n<main>\n  <section>\n    <h1>Heading</h1>\n  </section>\n</main>\n<footer></footer>'],
  ['CSS reset', 'CSS', 'A small modern reset', '*, *::before, *::after { box-sizing: border-box; }\nbody { margin: 0; }\nimg { max-width: 100%; display: block; }'],
  ['Flexbox', 'CSS', 'A flexible row', 'display: flex;\nalign-items: center;\njustify-content: space-between;\ngap: 1rem;'],
  ['Grid', 'CSS', 'A responsive grid', 'display: grid;\ngrid-template-columns: repeat(auto-fit, minmax(220px, 1fr));\ngap: 1rem;'],
  ['Media query', 'CSS', 'A mobile breakpoint', '@media (max-width: 600px) {\n  \n}'],
  ['Function', 'JavaScript', 'A named function', 'function greet(name) {\n  return `Hello, ${name}!`;\n}'],
  ['Event listener', 'JavaScript', 'Listen for a click', "document.querySelector('button').addEventListener('click', (event) => {\n  console.log(event);\n});"],
  ['DOM helper', 'JavaScript', 'A short query helper', "const $ = (selector) => document.querySelector(selector);"],
]
export const builtinSnippets: Snippet[] = items.map(([name, category, description, body], i) => ({ id: `builtin-${i}`, name, category, description, body, builtin: true }))
export function validateSnippet(value: Partial<Snippet>, existing: Snippet[], ignoreId?: string): Snippet {
  const name = value.name?.trim(), category = value.category?.trim(), body = value.body
  if (!name || !category || !body?.trim() || name.length > 80 || category.length > 40 || body.length > 100_000) throw new Error('Add a name, category and body (within the size limits).')
  if (existing.some(item => item.id !== ignoreId && item.name.toLowerCase() === name.toLowerCase() && item.category.toLowerCase() === category.toLowerCase())) throw new Error('A snippet with that name and category already exists.')
  return { id: ignoreId ?? crypto.randomUUID(), name, category, description: value.description?.trim() ?? '', body }
}
