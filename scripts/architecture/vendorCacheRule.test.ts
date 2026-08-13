// The `no-vendor-cache-logic` rule, and the identifier collision it used to trip over.
//
// The rule exists to keep Anthropic prompt caching inside src/lib/ai/llm/providers/ — the app must
// never know whether prompt caching exists. It matched the bare token `cacheControl` anywhere under
// src/, which is correct for Anthropic and wrong for everything else: `cacheControl` is ALSO the
// Cloud Storage JSON API's object-metadata field name, and src/lib/media has to spell it exactly
// that way to set an object's HTTP Cache-Control. So storage code was failing an AI rule.
//
// The pattern is now anchored on Anthropic's cache VALUE (`{ type: 'ephemeral' }`) rather than the
// shared field name. These tests pin BOTH directions, because narrowing a guard is exactly the kind
// of change that can quietly turn it into a no-op:
//   - the real Anthropic line must still be caught
//   - the Cloud Storage line must not be
// If someone widens the pattern back to the bare token, the storage test fails; if someone deletes
// the vendor coverage, the Anthropic tests fail.

import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

/** The exact lines the two layers really contain, quoted from the source files. */
const ANTHROPIC_LINE =
  "? { ...m, providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' as const } } } }"
const GCS_LINE = 'body: JSON.stringify({ cacheControl: IMMUTABLE_MEDIA_CACHE_CONTROL }),'

/** The rule's patterns, as the guard actually defines them today. */
const VENDOR_CACHE_PATTERNS = [
  /\bcacheControl\b[^\n]*\bephemeral\b/,
  /\bcache_control\b/,
  /anthropic-beta/,
  /prompt-caching/,
  /providerOptions\s*:\s*\{\s*['"]?(anthropic|openai|google|xai|deepseek|mistral|vertex)\b/,
]
const matchesAny = (line: string) => VENDOR_CACHE_PATTERNS.some((p) => p.test(line))

describe('the rule still catches vendor cache logic', () => {
  it('flags the real Anthropic prompt-caching line', () => {
    expect(matchesAny(ANTHROPIC_LINE)).toBe(true)
  })

  it.each([
    ["headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' }", 'the beta header'],
    ['{ cache_control: { type: "ephemeral" } }', 'the raw Anthropic API field'],
    ["providerOptions: { openai: { store: true } }", 'another vendor’s options'],
    ["providerOptions: { google: { safetySettings: [] } }", 'Google options'],
  ])('still flags %s (%s)', (line) => {
    expect(matchesAny(line)).toBe(true)
  })

  it('the patterns it relies on are all still present in the guard', () => {
    const guard = read('scripts/architecture/check.mjs')
    for (const needle of ['anthropic-beta', 'prompt-caching', 'cache_control', 'providerOptions']) {
      expect(guard).toContain(needle)
    }
  })
})

describe('the rule no longer flags Cloud Storage object metadata', () => {
  it('does not match the GCS cacheControl field', () => {
    expect(matchesAny(GCS_LINE)).toBe(false)
  })

  it('does not match a plain storage metadata object either', () => {
    expect(matchesAny("{ cacheControl: 'public, max-age=31536000, immutable' }")).toBe(false)
  })

  it('the guard no longer carries the bare-token pattern that caused this', () => {
    const guard = read('scripts/architecture/check.mjs')
    // The bare `/\bcacheControl\b/,` form — a complete pattern with nothing narrowing it.
    expect(guard).not.toMatch(/\/\\bcacheControl\\b\/\s*,/)
  })
})

describe('the guard passes on this repository', () => {
  it('reports no violations', () => {
    // Throws (non-zero exit) if any rule fires — the end-to-end check CI runs.
    expect(() =>
      execFileSync('node', ['scripts/architecture/check.mjs'], { cwd: root, encoding: 'utf8' })
    ).not.toThrow()
  })
})
