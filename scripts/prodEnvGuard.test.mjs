import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertNotProduction, findProductionReferences, isRealVercel, PROD_SUPABASE_REF, AUDIT_SUPABASE_REF } from './prodEnvGuard.mjs'

// The production-database guard covers dev, build AND start, reads the env files Next auto-loads,
// exempts only a real Vercel build, and is loud when overridden. Fixtures carry the project REF
// only — never a credential.

const PROD_URL = `https://${PROD_SUPABASE_REF}.supabase.co`
const AUDIT_URL = `https://${AUDIT_SUPABASE_REF}.supabase.co`

let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'prodguard-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('prodEnvGuard', () => {
  it('a clean audit checkout starts', () => {
    writeFileSync(join(dir, '.env.local'), `NEXT_PUBLIC_SUPABASE_URL=${AUDIT_URL}\n`)
    expect(assertNotProduction({ env: { NEXT_PUBLIC_SUPABASE_URL: AUDIT_URL }, cwd: dir, command: 'dev' }).allowed).toBe('clean')
  })

  it.each(['.env.production.local', '.env.production', '.env.local', '.env', '.env.development.local'])(
    'refuses when %s points at production — even if process.env does not (yet)', (file) => {
      writeFileSync(join(dir, file), `NEXT_PUBLIC_SUPABASE_URL="${PROD_URL}"\nVERCEL="1"\n`)
      expect(() => assertNotProduction({ env: {}, cwd: dir, command: 'start' })).toThrow(/REFUSING TO START `next start`[\s\S]*Env files with the production ref: \.env/)
    })

  it('refuses any process env value that references production, naming the variable only', () => {
    let msg = ''
    try { assertNotProduction({ env: { SOME_DB_URL: `postgres://x@db.${PROD_SUPABASE_REF}.supabase.co:5432/postgres` }, cwd: dir, command: 'build' }) } catch (e) { msg = String(e.message) }
    expect(msg).toMatch(/REFUSING TO START `next build`/)
    expect(msg).toMatch(/SOME_DB_URL/)
    expect(msg).not.toMatch(/postgres:\/\//) // names, never values
  })

  it('VERCEL=1 from a pulled env file is NOT an exemption — only a real Vercel build root is', () => {
    expect(isRealVercel({ VERCEL: '1' }, 'D:\\Claude\\Projects\\TappyAI\\tappyai-mvp')).toBe(false)
    expect(isRealVercel({ VERCEL: '1' }, '/Users/x/tappyai-mvp')).toBe(false)
    expect(isRealVercel({ VERCEL: '1' }, '/vercel/path0')).toBe(true)
    expect(isRealVercel({}, '/vercel/path0')).toBe(false)
    writeFileSync(join(dir, '.env.production.local'), `NEXT_PUBLIC_SUPABASE_URL=${PROD_URL}\nVERCEL="1"\n`)
    expect(() => assertNotProduction({ env: { VERCEL: '1', NEXT_PUBLIC_SUPABASE_URL: PROD_URL }, cwd: dir })).toThrow(/REFUSING/)
    expect(assertNotProduction({ env: { VERCEL: '1', NEXT_PUBLIC_SUPABASE_URL: PROD_URL }, cwd: '/vercel/path0' }).allowed).toBe('vercel')
  })

  it('the override is never silent — it prints a banner naming what it lets through', () => {
    const lines = []
    writeFileSync(join(dir, '.env.production.local'), `NEXT_PUBLIC_SUPABASE_URL=${PROD_URL}\n`)
    const r = assertNotProduction({ env: { ALLOW_PROD_SUPABASE_IN_DEV: '1', NEXT_PUBLIC_SUPABASE_URL: PROD_URL }, cwd: dir, command: 'dev', log: (m) => lines.push(m) })
    expect(r.allowed).toBe('override')
    expect(lines.join('\n')).toMatch(/ALLOW_PROD_SUPABASE_IN_DEV=1[\s\S]*OVERRIDDEN[\s\S]*PRODUCTION project[\s\S]*\.env\.production\.local/)
  })

  it('the override prints even when nothing is currently production (so it gets removed)', () => {
    const lines = []
    assertNotProduction({ env: { ALLOW_PROD_SUPABASE_IN_DEV: '1' }, cwd: dir, log: (m) => lines.push(m) })
    expect(lines.join('\n')).toMatch(/OVERRIDDEN[\s\S]*remove the override/)
  })

  it('reports files and variables separately', () => {
    writeFileSync(join(dir, '.env.production'), `X=${PROD_URL}\n`)
    expect(findProductionReferences({ env: { A: PROD_URL, B: AUDIT_URL }, cwd: dir })).toEqual({ files: ['.env.production'], vars: ['A'] })
  })
})
