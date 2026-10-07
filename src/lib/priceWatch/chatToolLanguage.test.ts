import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { pw } from './messages'
import {
  savePriceWatchPolicy,
  MAX_ACTIVE_WATCHES,
  type SavePriceWatchArgs,
} from '@/lib/ai/actions/savePriceWatch'

// ── PW-EN-05 / PW-VI-02 — the save_price_watch chat tool ───────────────────
//
// The tool is defined inline inside the chat route's `tools:` map, so its
// execute() cannot be invoked without standing up the whole streaming route. Its
// language contract is therefore asserted two ways, both deterministic:
//
//   1. the OUTPUT of the message layer it now calls (behaviour), and
//   2. a source check that the tool actually routes through that layer and holds
//      no Vietnamese literal of its own (wiring).
//
// (2) matters because the strings it used to hold were Windows-1252-corrupted in
// the file — the reason they were replaced by line number rather than by text
// match. If anyone reintroduces a literal there, this fails.

const ROUTE = 'src/app/api/chat/route.ts'
const src = readFileSync(ROUTE, 'utf8')

/** The save_price_watch tool definition only. */
const toolBlock = (() => {
  const start = src.indexOf('save_price_watch: tool(')
  expect(start, 'save_price_watch tool must exist in the chat route').toBeGreaterThan(-1)
  return src.slice(start, src.indexOf('onFinish:', start))
})()

const VI_DIACRITIC = /[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i

describe('PW-VI-02 — a Vietnamese user gets Vietnamese', () => {
  it('the save confirmation is Vietnamese and names product, cadence and target', () => {
    const m = pw.saved('vi', 'AirPods Pro 2', 4_500_000)
    expect(m).toContain('AirPods Pro 2')
    expect(m).toContain('6 tiếng')
    expect(m).toContain('4.5 triệu')
  })

  it('the login and limit messages are Vietnamese', () => {
    expect(pw.needLogin('vi')).toMatch(VI_DIACRITIC)
    expect(pw.limitReached('vi')).toContain('Tối đa 10')
  })
})

describe('PW-EN-05 — an English user gets English', () => {
  it('the save confirmation is English and names product, cadence and target', () => {
    const m = pw.saved('en', 'AirPods Pro 2', 4_500_000)
    expect(m).toContain('AirPods Pro 2')
    expect(m).toMatch(/every 6 hours/i)
    expect(m).toContain('4.5M')
    expect(m).not.toMatch(VI_DIACRITIC)
  })

  it('the login, limit and save-error messages are English', () => {
    expect(pw.needLogin('en')).toMatch(/sign in/i)
    expect(pw.limitReached('en')).toMatch(/at most 10/i)
    expect(pw.saveError('en')).toMatch(/couldn't save/i)
    for (const s of [pw.needLogin('en'), pw.limitReached('en'), pw.saveError('en')]) {
      expect(s).not.toMatch(VI_DIACRITIC)
    }
  })
})

// ── The wiring, after P0-2 ───────────────────────────────────────────────────
//
// The header above says execute() "cannot be invoked without standing up the whole streaming
// route". That stopped being true: P0-2 moved the permission / validation / scope / execute steps
// out of the inline tool and into `savePriceWatchPolicy`, precisely so a write action would be
// reachable from a test.
//
// So the source scans below are replaced by BEHAVIOUR wherever behaviour is now available — a
// stronger check, not a weaker one: `toContain('pw.needLogin(')` proved a call was written, never
// that its result was returned. Only the assertions that remain genuinely source-level (the route
// passing the per-message language; the corrupted literals staying gone) are still scans.

describe('the tool is actually wired to the message layer', () => {
  /** Minimal Supabase stand-in: `activeCount` drives the scope check, inserts are recorded. */
  const fakeDb = (activeCount = 0) => {
    const inserts: Record<string, unknown>[] = []
    const tables: string[] = []
    const client = {
      from: (t: string) => {
        tables.push(t)
        return {
          select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: activeCount, error: null }) }) }),
          insert: (row: Record<string, unknown>) => {
            inserts.push(row)
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'pw-1' }, error: null }) }) }
          },
        }
      },
    } as unknown as SupabaseClient
    return { client: () => client, inserts, tables }
  }

  it.each(['vi', 'en'] as const)('the %s save confirmation is the message layer output, verbatim', async (lang) => {
    const db = fakeDb()
    const policy = savePriceWatchPolicy(lang, db.client)
    const validated = policy.validate({ product_name: 'AirPods Pro 2', target_price: 4_500_000, search_query: 'q' })
    expect(validated.ok).toBe(true)
    const result = await policy.execute({ userId: 'u1', args: (validated as { ok: true; args: SavePriceWatchArgs }).args })
    // Not "the function is called somewhere" — the exact string the user reads.
    expect(result.message).toBe(pw.saved(lang, 'AirPods Pro 2', 4_500_000))
  })

  it.each(['vi', 'en'] as const)('the %s refusal messages are the message layer output, verbatim', async (lang) => {
    const policy = savePriceWatchPolicy(lang, fakeDb(10).client)
    expect(policy.unauthenticatedMessage).toBe(pw.needLogin(lang))
    expect(policy.failureMessage).toBe(pw.saveError(lang))
    const scope = await policy.scope!({ userId: 'u1', args: { productName: 'x', targetPriceVnd: 1, searchQuery: 'q' } })
    expect(scope.ok).toBe(false)
    expect(scope.ok === false && scope.message).toBe(pw.limitReached(lang))
  })

  it('holds no Vietnamese literal of its own — every string comes from the message layer', () => {
    const policySrc = readFileSync('src/lib/ai/actions/savePriceWatch.ts', 'utf8')
    // Comments may explain in English; the code must carry no Vietnamese copy.
    const codeOnly = policySrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(codeOnly).not.toMatch(VI_DIACRITIC)
  })

  it('and none of the old Windows-1252-corrupted literals survive', () => {
    // The corruption signature ("Ã", "áº", "Ä‘") is what those strings looked like
    // on disk. Its absence proves they were replaced, not re-encoded.
    const bodies = [toolBlock.slice(toolBlock.indexOf('execute:')), readFileSync('src/lib/ai/actions/savePriceWatch.ts', 'utf8')]
    for (const body of bodies) {
      for (const mojibake of ['Ã¡', 'áº', 'Ä‘', 'Æ°', 'á»']) {
        expect(body, `corrupted literal fragment "${mojibake}" still present`).not.toContain(mojibake)
      }
    }
  })

  it('uses the per-message language, not a stored preference', () => {
    // add_user_language_preference.sql is explicit: AI response language "stays
    // auto-detected per-message … and is not stored per-user". The tool must
    // therefore read pwLang (derived from `lang`), never profiles.language.
    expect(toolBlock).toContain('pwLang')
    expect(src).toMatch(/const pwLang = normalizePwLang\(/)
    expect(toolBlock).not.toContain('profiles')
  })

  it('database semantics are untouched — same table, same ceiling, same rounding', () => {
    // P0-2 moved WHERE these run, not WHAT they do. Asserted behaviourally now that the policy is
    // reachable: the ceiling is the exported constant, the table and the rounding are observed on
    // the insert the policy actually performs.
    expect(MAX_ACTIVE_WATCHES).toBe(10)
    expect(readFileSync('src/lib/ai/actions/savePriceWatch.ts', 'utf8')).toContain('createAdminClient()')
  })

  it('rounds the target price and writes the price_watches table', async () => {
    const db = fakeDb()
    const policy = savePriceWatchPolicy('vi', db.client)
    const v = policy.validate({ product_name: 'X', target_price: 4_500_000.7, search_query: 'q' })
    await policy.execute({ userId: 'u1', args: (v as { ok: true; args: SavePriceWatchArgs }).args })
    expect(db.tables).toContain('price_watches')
    expect(db.inserts[0]).toMatchObject({ target_price: 4_500_001, user_id: 'u1' })
  })
})
