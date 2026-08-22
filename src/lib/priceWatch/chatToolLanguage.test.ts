import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { pw } from './messages'

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

describe('the tool is actually wired to the message layer', () => {
  it('every user-facing return routes through pw.*', () => {
    for (const call of ['pw.needLogin(', 'pw.limitReached(', 'pw.saveError(', 'pw.saved(']) {
      expect(toolBlock, `${call} missing from save_price_watch`).toContain(call)
    }
  })

  it('it holds no Vietnamese literal of its own any more', () => {
    // `describe()` text for the model is prompt content, not user-facing copy, so
    // only the execute() body is checked.
    const execBody = toolBlock.slice(toolBlock.indexOf('execute:'))
    expect(execBody).not.toMatch(VI_DIACRITIC)
  })

  it('and none of the old Windows-1252-corrupted literals survive', () => {
    // The corruption signature ("Ã", "áº", "Ä‘") is what those strings looked like
    // on disk. Its absence proves they were replaced, not re-encoded.
    const execBody = toolBlock.slice(toolBlock.indexOf('execute:'))
    for (const mojibake of ['Ã¡', 'áº', 'Ä‘', 'Æ°', 'á»']) {
      expect(execBody, `corrupted literal fragment "${mojibake}" still present`).not.toContain(mojibake)
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

  it('database semantics are untouched — still admin client, same table, same ceiling', () => {
    expect(toolBlock).toContain('createAdminClient()')
    expect(toolBlock).toContain("from('price_watches')")
    expect(toolBlock).toContain('>= 10')
    expect(toolBlock).toContain('Math.round(target_price)')
  })
})
