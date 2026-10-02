import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

// UAT4 P0 (2026-09-27): surfaces that pin themselves dark with `<div class="v3-theme dark">` kept
// the LIGHT token ground when the app theme was light (the dark block was `.dark .v3-theme`, an
// ANCESTOR selector), while Tailwind `dark:` variants inside them switched to light text. Chat
// product names and prices were white-on-white for every light-theme user.
const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

function selectorOf(token: string): string {
  const at = css.indexOf(token)
  expect(at, token).toBeGreaterThan(-1)
  const open = css.lastIndexOf('{', at)
  const prevClose = css.lastIndexOf('}', open)
  return css.slice(prevClose + 1, open).replace(/\/\*[\s\S]*?\*\//g, '').trim()
}

describe('the dark v3 palette applies to a surface pinned with `v3-theme dark`', () => {
  it('the dark token block matches both `.dark .v3-theme` and `.v3-theme.dark`', () => {
    const sel = selectorOf('--v3-page: #0A0F1C;').split(',').map(s => s.trim())
    expect(sel).toContain('.dark .v3-theme')
    expect(sel).toContain('.v3-theme.dark')
  })

  it('the pinned surfaces still exist (the rule above is what makes them dark)', () => {
    const hits = execSync('git grep -l "v3-theme dark" -- "src/**/*.tsx"', { encoding: 'utf8' }).split('\n').filter(f => f && !f.includes('.test.'))
    expect(hits.length).toBeGreaterThan(0)
  })
})
