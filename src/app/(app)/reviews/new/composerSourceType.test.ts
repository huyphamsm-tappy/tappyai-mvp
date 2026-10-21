/**
 * source_type follows the pasted link synchronously. Post is enabled as soon as the link is
 * recognised, so a submit inside the resolve debounce must save the right source_type and the
 * matching placeholder — not the previous (default 'youtube') one. Source commit d5679d0c7.
 *
 * Structural check (house style for the composer suites): the assignment must sit in
 * handleUrlChange BEFORE the debounce timer is scheduled. Mutation-checked by removing it.
 */

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const SRC = readFileSync('src/app/(app)/reviews/new/page.tsx', 'utf8')

function handleUrlChangeBody(): string {
  const start = SRC.indexOf('const handleUrlChange = (val: string)')
  const end = SRC.indexOf('const resolveUrl = async', start)
  return SRC.slice(start, end)
}

describe('source_type is set synchronously from the pasted link', () => {
  it('handleUrlChange sets the source type from the text before scheduling the resolve', () => {
    const body = handleUrlChangeBody()
    expect(body).toMatch(/const\s+detectedNow\s*=\s*detectSource\(trimmed\)/)
    expect(body).toMatch(/if\s*\(\s*detectedNow\s*\)\s*setSource_type\(detectedNow\)/)
    const set = body.indexOf('setSource_type(detectedNow)')
    const timer = body.indexOf('setTimeout(')
    expect(set).toBeGreaterThan(-1)
    expect(set).toBeLessThan(timer)
  })

  it('the resolve path still sets the source type (the network call keeps its own behaviour)', () => {
    const start = SRC.indexOf('const resolveUrl = async')
    const body = SRC.slice(start, start + 1200)
    expect(body).toMatch(/setSource_type\(detected\)/)
  })

  it('does not reset the source for input that is not a recognised link', () => {
    const body = handleUrlChangeBody()
    expect(body).not.toMatch(/setSource_type\(\s*['"]youtube['"]\s*\)/)
  })
})
