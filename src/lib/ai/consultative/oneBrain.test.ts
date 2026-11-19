import { describe, it, expect } from 'vitest'
import { consultOneBrainOn, CONSULT_ONE_BRAIN_FLAG } from '@/lib/config/consultFlags'
import { ONE_BRAIN_CORE, ONE_BRAIN_MAX_STEPS, ONE_BRAIN_MAX_TOKENS, ONE_BRAIN_NO_BLOCKS_LINE, ONE_BRAIN_SHAPE_REMINDER, PLACE_RULE, PRESENT_PLAN_DESCRIPTION, oneBrainDynamic } from './oneBrain'

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
  it('buying: concrete listings, a pick and one plain closing line, the narrowing choices only as tap-to-send chips (owner 18/11, ChatGPT style: no question to the person); a store the person names is searched on its own site (30/10)', () => {
    for (const s of ['lay out the concrete listings', 'end on your pick in one plain closing line', 'from the whole message, not from single words', "search that store's own site", 'Never write a product link that did not come from a tool result', '[FOLLOWUPS]option 1|option 2|option 3[/FOLLOWUPS]', 'the answer does not end with a question to the person', 'end the same way: a closing line and the chips', 'one search_products call is rarely the whole picture', 'price range by condition and version', 'a listing you did not name gets no card']) expect(ONE_BRAIN_CORE, s).toContain(s)
    // the old rule must be gone: no narrowing questions to the person, in the core or in the reminder
    expect(ONE_BRAIN_CORE).not.toContain('at most three short narrowing questions')
    expect(ONE_BRAIN_SHAPE_REMINDER).not.toContain('narrowing questions')
    // the shape reminder (last in the prompt) must not undo the buying rule
    expect(ONE_BRAIN_SHAPE_REMINDER).toContain('closing line of the buying rule')
    expect(ONE_BRAIN_SHAPE_REMINDER).toContain('[FOLLOWUPS] chips') // the reminder is last in the prompt: the chips line is named there too (measured 17/20 without it)
  })
  // 19/11: the "recommend only venues search_places returned" sentence was measured in three gates (s6, s8, s8b: content 3.54/3.45/3.39 vs 3.62 in M1, time and cost creeping up) with no gain on
  // the venue questions, and was taken out again; the plan-card rules below stay (the visa gap closed in D30).
  it('the plan card holds the one budget and the visa note for a border crossing (UI eval M1, 19/11); the venue-only sentence is not in the core', () => {
    expect(ONE_BRAIN_CORE).not.toContain('Recommend only venues that search_places returned')
    expect(PRESENT_PLAN_DESCRIPTION).toContain('The budget appears ONCE, in the plan card')
    expect(PRESENT_PLAN_DESCRIPTION).toContain('whether the traveller needs a visa for their passport')
    // general principles only: no country, city or place name in them
    for (const w of ['Singapore', 'Sa Pa', 'Đà Nẵng', 'Hội An', 'Tân Bình']) expect(`${ONE_BRAIN_CORE}${PRESENT_PLAN_DESCRIPTION}`, w).not.toContain(w)
  })
  it('buying: the model is told when to declare purchase intent (buy links) and to make one call per distinct need (owner 19/11: the tool call, not a Serper cap)', () => {
    expect(ONE_BRAIN_CORE).toContain('Set purchase_links to true only when the person asks where to buy')
    expect(ONE_BRAIN_CORE).toContain('One call per distinct need')
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
  it('N1 (30/10): answers the need behind the question; a subject gets a real overview, not 150-350 words', () => {
    // Measured 30/10 (blind, vs ChatGPT Think): "complete" 6.2 vs 8.4, "useful" 6.7 vs 8.2. "Sài Gòn có mưa không" got one sentence (ChatGPT:
    // the rain hours and what to do), "cuối tuần Hà Nội có mưa không, định picnic" 415 characters. The old rule sent a yes/no to 1-3 paragraphs.
    for (const s of ['Answer the need behind the question', 'then what the person needs to act on it', 'about 200-500 words', 'each option as its own block', 'a short table that maps each need to the option', 'one numbered item per story']) expect(ONE_BRAIN_CORE, s).toContain(s)
    expect(ONE_BRAIN_CORE).not.toContain('150-350')
    expect(ONE_BRAIN_CORE).not.toMatch(/a yes\/no\) gets 1-3 short paragraphs/)
    expect(ONE_BRAIN_SHAPE_REMINDER).toContain('the need behind the question')
    expect(ONE_BRAIN_SHAPE_REMINDER).not.toContain('150-350')
  })
  it('N3 (30/10): useful, not only careful - known facts are stated, only what changes is hedged, a partial lookup still answers every part', () => {
    // Measured 30/10: "5 tin kinh tế" answered with 2 items and "mình chưa tìm đủ 5 tin"; three air purifiers with "chưa xác nhận được CADR,
    // độ ồn" for each (ChatGPT stated the maker's published figures). The rule against inventing stays as it is.
    // 17/11 (owner: every answer that states a fact carries an authoritative source; Pro and Promax have the tools): the "known facts without a search" licence is replaced by a duty to
    // check and cite every statement of fact; calculation, code, writing, translation, small talk and refusals need no search. The hedge and partial-lookup rules stay.
    for (const s of ['every statement of fact about the world', 'carries the link of its source', 'most authoritative page', 'No search is needed for what a tool result already states', 'for calculation, code, writing or translating','say so instead of stating it with no source']) expect(ONE_BRAIN_CORE, s).toContain(s)
    expect(ONE_BRAIN_CORE).not.toContain('may be stated from your own knowledge without a search result')
    // 18/11 (owner: the place cards of yesterday's mockup came back as avatar cards and tables): the every-fact rule must not send the model past its dedicated tools - the card is the source of what its tool states
    for (const s of ['with the tool that fits it (the dedicated tool when there is one', 'the card is the source']) expect(ONE_BRAIN_CORE, s).toContain(s)
    expect(ONE_BRAIN_CORE).not.toContain('is checked with web_search in this turn')
    for (const s of ['# Be useful, not only careful', 'Hedge only what changes', 'Asked for N items, give N items', 'never in place of the answer']) expect(ONE_BRAIN_CORE, s).toContain(s)
    expect(ONE_BRAIN_CORE).toContain('Never invent a fact')
    expect(ONE_BRAIN_SHAPE_REMINDER).toMatch(/hedge only what changes/i)
  })
  it('limits: 8 steps (2 kept for writing, so 6 rounds of lookup; owner 29/10), 8000 output tokens (03/11: a 7-day trip card did not fit in 4000)', () => {
    expect(ONE_BRAIN_MAX_STEPS).toBe(8)
    expect(ONE_BRAIN_MAX_TOKENS).toBe(8000)
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
  it('02/11: the language of a message is not a place - local services default to Vietnam for every language, and the rule sits before the language lines', () => {
    for (const lang of ['vi', 'en']) {
      const d = oneBrainDynamic({ lang, now, address: null, hasLocation: false, blocks: [], latestLang: 'zh' })
      expect(d).toContain(PLACE_RULE)
      expect(d.indexOf(PLACE_RULE)).toBeLessThan(d.indexOf('write this whole answer in Chinese'))
    }
    expect(PLACE_RULE).toMatch(/in Vietnam by default, whatever language/)
    expect(PLACE_RULE).toMatch(/hospitals and clinics, emergency numbers/)
    expect(PLACE_RULE).toMatch(/unless their device location or their own words/)
  })
  it('18/11 review: the instruction never contradicts a turn - no "do not search" licence beside the check-every-fact duty, no brand in the buying line, and a turn without present_blocks or without tools says so', () => {
    expect(ONE_BRAIN_CORE).not.toContain('Do NOT search for general knowledge')
    expect(ONE_BRAIN_CORE).not.toContain('unless it is world-famous')
    expect(ONE_BRAIN_CORE).not.toMatch(/Shopee|TikTok Shop|Lazada/)
    expect(ONE_BRAIN_CORE).not.toContain('offer to lighten')
    const base = { lang: 'vi', now, address: null, hasLocation: false, blocks: [] as string[], mode: 'chat' as const }
    expect(oneBrainDynamic(base)).not.toContain(ONE_BRAIN_NO_BLOCKS_LINE)
    expect(oneBrainDynamic({ ...base, noBlocks: true })).toContain(ONE_BRAIN_NO_BLOCKS_LINE)
    expect(ONE_BRAIN_NO_BLOCKS_LINE).toContain('do not call it')
    // a Free turn has one line that overrides every tool instruction above it
    const free = oneBrainDynamic({ ...base, noTools: true, noBlocks: true })
    expect(free).toContain('This overrides every instruction above that calls a tool')
    expect(free).not.toContain(ONE_BRAIN_NO_BLOCKS_LINE)
  })
  it('names the address the device sent, never coordinates', () => {
    expect(oneBrainDynamic({ lang: 'en', now, address: 'Quận 1, TP.HCM', hasLocation: true, blocks: [] })).toContain('device location: Quận 1, TP.HCM')
    const noAddr = oneBrainDynamic({ lang: 'en', now, address: null, hasLocation: true, blocks: [] })
    expect(noAddr).toContain('shared their device location')
    expect(noAddr).toContain('Reply in English')
  })
})
