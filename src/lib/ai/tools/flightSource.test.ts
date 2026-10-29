// @vitest-environment node
// Owner 2026-10-04 (final patch): the deprecated flight-fare provider is removed from the architecture — runtime, env, prompts, user text, tests.
// Flights are booking hand-off only. This scan keeps it out (the name is assembled so this file does not match itself).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const BANNED = new RegExp([['travel', 'payouts'].join(''), ['avia', 'sales'].join('')].join('|'), 'i')
const SKIP_DIR = /(^|[\\/])(node_modules|\.next|out|evidence)([\\/]|$)/

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!SKIP_DIR.test(p)) walk(p, acc) } else if (/\.(ts|tsx|js|mjs|cjs|json|sql)$/.test(e.name)) acc.push(p)
  }
  return acc
}

describe('deprecated flight-fare provider: zero references', () => {
  it('no source, script, migration or env template names it', () => {
    const files = [...walk('src'), ...walk('scripts'), ...walk('supabase'), '.env.local.example', 'package.json', 'next.config.ts', 'vercel.json'].filter(f => fs.existsSync(f))
    const hits = files.filter(f => BANNED.test(fs.readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
    // 30/10: a synchronous read of every file in src/, scripts/ and supabase/; under the full run it passed the default 5 s (measured
    // 29–30/10, green alone every time). The scan and its assertion are unchanged; only the time it is given.
  }, 60_000)
  it('no flight-fare env var is read anywhere in src', () => {
    const files = walk('src')
    const hits = files.filter(f => /process\.env\.[A-Z_]*(FLIGHT|FARE|AVIA)[A-Z_]*/.test(fs.readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })
})
