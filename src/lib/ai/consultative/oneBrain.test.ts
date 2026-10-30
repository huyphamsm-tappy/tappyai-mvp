import { describe, it, expect } from 'vitest'
import { consultOneBrainOn, CONSULT_ONE_BRAIN_FLAG } from '@/lib/config/consultFlags'
import { ONE_BRAIN_CORE, ONE_BRAIN_MAX_STEPS, ONE_BRAIN_MAX_TOKENS, ONE_BRAIN_SHAPE_REMINDER, oneBrainDynamic } from './oneBrain'

describe('CONSULT_ONE_BRAIN flag', () => {
  it('is ON only for exactly "1", and never in a production runtime', () => {
    expect(CONSULT_ONE_BRAIN_FLAG).toBe('CONSULT_ONE_BRAIN')
    expect(consultOneBrainOn({})).toBe(false)
    expect(consultOneBrainOn({ CONSULT_ONE_BRAIN: '1' })).toBe(true)
    for (const v of ['0', 'true', 'on', ' 1', 'yes']) expect(consultOneBrainOn({ CONSULT_ONE_BRAIN: v }), v).toBe(false)
    expect(consultOneBrainOn({ CONSULT_ONE_BRAIN: '1', VERCEL_ENV: 'production' })).toBe(false)
    // not tied to the capability level
    expect(consultOneBrainOn({ CONSULT_CAPABILITY_LEVEL: '3' })).toBe(false)
  })
})

describe('the one general instruction', () => {
  it('carries the layout and voice principles and the tool and source rules', () => {
    for (const s of ['Read the WHOLE conversation', 'Ask a question INSTEAD of answering only when no useful answer is possible', 'web_search', 'Never invent a fact', 'markdown link', 'give the date', 'Answer the main question first', 'default to a complete answer', '**bold label**', 'look them up BEFORE writing', 'never guess who someone is', 'means the lookup FAILED', 'decide your pick BEFORE you write', 'Leave a blank line before and after every list', 'One search_places call per kind of place', 'markdown table', 'one heading per day', 'does not render LaTeX', '"mình"', 'No routine closing question']) {
      expect(ONE_BRAIN_CORE, s).toContain(s)
    }
  })
  it('buying: concrete listings and at most three narrowing questions; a store the person names is searched on its own site (30/10)', () => {
    for (const s of ['lay out the concrete listings', 'at most three short narrowing questions', 'from the whole message, not from single words', "search that store's own site", 'Never write a product link that did not come from a tool result', '[FOLLOWUPS]option 1|option 2|option 3[/FOLLOWUPS]', 'in place of the usual closing offer', 'then end the same way: a narrowing question and its tap-to-send chips', 'one search_products call is rarely the whole picture', 'price range by condition and version', 'a listing you did not name gets no card']) expect(ONE_BRAIN_CORE, s).toContain(s)
    // the shape reminder (last in the prompt) must not undo the buying rule
    expect(ONE_BRAIN_SHAPE_REMINDER).toContain('narrowing questions of the buying rule')
    expect(ONE_BRAIN_SHAPE_REMINDER).toContain('[FOLLOWUPS] chips') // the reminder is last in the prompt: the chips line is named there too (measured 17/20 without it)
  })
  it('the buying rule names no product, brand, store or language of the question (any product, any language)', () => {
    const rule = ONE_BRAIN_CORE.split('\n').filter(l => /BUY something|names a store|price or buying question|Name each product or listing/.test(l)).join('\n')
    expect(rule.length).toBeGreaterThan(200)
    for (const w of ['iPhone', 'Apple', 'MacBook', 'Samsung', 'Điện Máy', 'dienmayxanh', 'Thế Giới Di Động', 'Phong Vũ', 'Shopee', 'Lazada', 'TikTok', 'giá', 'mua']) expect(rule, w).not.toContain(w)
  })
  it('is general: no Vietnamese phrase list, no topic or evaluation item named', () => {
    // every line is written in English; a quoted Vietnamese phrase would be a per-question rule. The only Vietnamese words are the two forms of address.
    expect(ONE_BRAIN_CORE.replace('"mình"', '').replace('"bạn"', '')).not.toMatch(/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i)
    for (const w of ['Tesla', 'Quy Nhơn', 'Quy Nhon', 'Điện Biên', 'GitHub', 'Hoàng Sa', 'e-commerce']) expect(ONE_BRAIN_CORE, w).not.toContain(w)
  })
  it('limits: 8 steps (2 kept for writing, so 6 rounds of lookup; owner 29/10), 4000 output tokens', () => {
    expect(ONE_BRAIN_MAX_STEPS).toBe(8)
    expect(ONE_BRAIN_MAX_TOKENS).toBe(4000)
  })
})

describe('oneBrainDynamic', () => {
  const now = new Date('2026-10-28T13:00:00Z')
  it('states today in Vietnam, the language, and keeps the person\'s own blocks in order', () => {
    const d = oneBrainDynamic({ lang: 'vi', now, address: null, hasLocation: false, blocks: ['MEMORY', '', '  PREFS  ', 'STYLE'] })
    expect(d).toContain('(2026-10-28)')
    expect(d).toContain('Reply in Vietnamese')
    expect(d).toContain('has not shared a location')
    expect(d.indexOf('MEMORY')).toBeLessThan(d.indexOf('PREFS'))
    expect(d.indexOf('PREFS')).toBeLessThan(d.indexOf('STYLE'))
    expect(d).not.toContain('\n\n\n')
    // the shape rule is restated last (a small model weighs the end of the prompt most)
    expect(d.endsWith(ONE_BRAIN_SHAPE_REMINDER)).toBe(true)
    expect(ONE_BRAIN_SHAPE_REMINDER).toContain('**bold label**')
  })
  it('the person\'s own style setting outranks the default shape, even though the reminder is last (29/10)', () => {
    expect(ONE_BRAIN_SHAPE_REMINDER).toMatch(/response style[^.]*(wins|overrides)|(wins|overrides)[^.]*response style/i)
    expect(ONE_BRAIN_SHAPE_REMINDER).toContain('the person asks for')
  })
  it('names the address the device sent, never coordinates', () => {
    expect(oneBrainDynamic({ lang: 'en', now, address: 'Quận 1, TP.HCM', hasLocation: true, blocks: [] })).toContain('device location: Quận 1, TP.HCM')
    const noAddr = oneBrainDynamic({ lang: 'en', now, address: null, hasLocation: true, blocks: [] })
    expect(noAddr).toContain('shared their device location')
    expect(noAddr).toContain('Reply in English')
  })
})
