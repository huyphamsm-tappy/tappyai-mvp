import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Owner 01/11/2026: people just type. Auto picks a quick answer, a web lookup or thinking by itself, so the composer's "+" menu keeps only
// attaching and Deep Research. (Chat / Web / Thinking stay modes the server reads; they are not menu items.)
const source = readFileSync(join(process.cwd(), 'src/components/ChatInterface.tsx'), 'utf8')
const menu = source.slice(source.indexOf('data-testid="composer-plus-menu"'), source.indexOf('<textarea'))

describe('composer "+" menu', () => {
  it('offers attaching and Deep Research, nothing else', () => {
    const keys = [...menu.matchAll(/\{ key: '(\w+)'/g)].map(m => m[1])
    expect(keys).toEqual(['attach', 'deep'])
  })
})
