import { describe, it, expect } from 'vitest'
import { buildEmergencyTurn, emergencyDataStreamResponse, locationAlreadyAsked, readSafetyAnnotation, SAFETY_ANNOTATION_KIND } from './emergencyResponse'
import { vi as VI, en as EN, zh as ZH } from '@/lib/i18n/w5/safetyEmergency'

const HANOI = { lat: 21.03, lng: 105.85 }
const BANGKOK = { lat: 13.75, lng: 100.5 }
const base = { lang: 'vi' as const, priorMessages: [] as Array<{ role: string; content: unknown }>, now: new Date('2026-11-12T00:00:00Z') }
const numbers = (t: ReturnType<typeof buildEmergencyTurn>) => t.payload.hotlineCards.map(h => h.phoneNumber)

describe('buildEmergencyTurn', () => {
  it('a fire at a verified Vietnamese position: the 114 card only, tools denied, no location question', () => {
    const t = buildEmergencyTurn({ ...base, category: 'FIRE_RESCUE', userLocation: HANOI })
    expect(numbers(t)).toEqual(['114'])
    expect(t.payload.actionsDenied).toContain('tool_use')
    expect(t.payload.emergencyFallback?.locationClarificationPromptKey).toBeUndefined()
    expect(t.text).toContain('114')
    expect(t.text).toContain(VI['safety.emergency.guidance.knownPlace'])
  })
  it('medical -> 115 only; child protection -> 111 only; trafficking -> 111 only; police -> 113 only; each from the registry', () => {
    expect(numbers(buildEmergencyTurn({ ...base, category: 'MEDICAL', userLocation: HANOI }))).toEqual(['115'])
    // 12/11 UAT: a child being taken or abused right now also needs the police number. Child -> 111 then 113; trafficking/abduction -> 113 then 111 (a crime is happening now).
    expect(numbers(buildEmergencyTurn({ ...base, category: 'CHILD_PROTECTION', userLocation: HANOI }))).toEqual(['111', '113'])
    expect(numbers(buildEmergencyTurn({ ...base, category: 'HUMAN_TRAFFICKING', userLocation: HANOI }))).toEqual(['113', '111'])
    expect(numbers(buildEmergencyTurn({ ...base, category: 'POLICE', userLocation: HANOI }))).toEqual(['113'])
    // the caller may say a crime/abduction is happening now (113 first) or not (111 first); other categories are unaffected
    expect(numbers(buildEmergencyTurn({ ...base, category: 'CHILD_PROTECTION', userLocation: HANOI, crimeInProgress: true }))).toEqual(['113', '111'])
    expect(numbers(buildEmergencyTurn({ ...base, category: 'HUMAN_TRAFFICKING', userLocation: HANOI, crimeInProgress: false }))).toEqual(['111', '113'])
    expect(numbers(buildEmergencyTurn({ ...base, category: 'MEDICAL', userLocation: HANOI, crimeInProgress: true }))).toEqual(['115'])
  })
  it('🔑 child and trafficking cards: only for a verified Viet Nam position; 113 never carries hours or "free" while 111 does; annotation matches payload', () => {
    for (const cat of ['CHILD_PROTECTION', 'HUMAN_TRAFFICKING'] as const) {
      for (const loc of [null, BANGKOK]) {
        const t = buildEmergencyTurn({ ...base, category: cat, userLocation: loc })
        expect(t.payload.hotlineCards).toEqual([]); expect(t.annotation.cards).toEqual([])
        expect(t.text).not.toMatch(/\b11[13]\b/)
      }
      const t = buildEmergencyTurn({ ...base, category: cat, userLocation: HANOI })
      expect(t.annotation.cards.map(c => c.phoneNumber)).toEqual(numbers(t))
      const p = t.annotation.cards.find(c => c.phoneNumber === '113')!
      expect(p.operatingHours).toBeUndefined(); expect(p.freeOfCharge).toBeUndefined()
      expect(t.annotation.cards.find(c => c.phoneNumber === '111')!.operatingHours).toBe('24/7')
      expect(t.text.split('\n').find(l => l.includes(': 113'))!).not.toMatch(/24\/7|miễn phí|trực/i)
    }
  })
  it('the annotation carries the language of the turn (the card follows it); unknown values are dropped by the reader', () => {
    for (const lang of ['vi', 'en', 'zh'] as const) {
      const t = buildEmergencyTurn({ ...base, lang, category: 'FIRE_RESCUE', userLocation: HANOI })
      expect(t.annotation.lang).toBe(lang)
      expect(readSafetyAnnotation([JSON.parse(JSON.stringify(t.annotation))])?.lang).toBe(lang)
    }
    expect(readSafetyAnnotation([{ kind: SAFETY_ANNOTATION_KIND, cards: [], lang: 'xx' }])?.lang).toBeUndefined()
    expect(readSafetyAnnotation([{ kind: SAFETY_ANNOTATION_KIND, cards: [] }])?.lang).toBeUndefined()
  })
  it('🔑 no position, or a position outside Viet Nam: NO card and no number in the text, guidance and one location question', () => {
    for (const loc of [null, BANGKOK]) {
      const t = buildEmergencyTurn({ ...base, category: 'MEDICAL', userLocation: loc })
      expect(t.payload.hotlineCards).toEqual([])
      expect(t.text).not.toMatch(/\b11[1-5]\b/)
      expect(t.text).toContain(VI['safety.emergency.guidance.unknownPlace'])
      expect(t.text).toContain(VI['safety.emergency.askLocation'])
    }
  })
  it('🔑 the person\'s language never picks the place: Vietnamese words with no position give no card', () => {
    expect(buildEmergencyTurn({ ...base, lang: 'vi', category: 'FIRE_RESCUE', userLocation: null }).payload.hotlineCards).toEqual([])
  })
  it('🔑 at most one location question per episode: a thread that already asked does not ask again, but still gives guidance', () => {
    const prior = [{ role: 'assistant', content: `x\n\n${VI['safety.emergency.askLocation']}` }]
    expect(locationAlreadyAsked(prior)).toBe(true)
    const t = buildEmergencyTurn({ ...base, priorMessages: prior, category: 'MEDICAL', userLocation: null })
    expect(t.text).not.toContain(VI['safety.emergency.askLocation'])
    expect(t.text).toContain(VI['safety.emergency.guidance.unknownPlace'])
    expect(t.payload.emergencyFallback?.locationClarificationPromptKey).toBeUndefined()
  })
  it('the English question also counts as asked; an unrelated assistant turn does not', () => {
    expect(locationAlreadyAsked([{ role: 'assistant', content: EN['safety.emergency.askLocation'] }])).toBe(true)
    expect(locationAlreadyAsked([{ role: 'assistant', content: 'Xin chào' }, { role: 'user', content: VI['safety.emergency.askLocation'] }])).toBe(false)
  })
  it('🔑 113, 114 and 115 never get hours or "free" (the registry omits them); 111 and 112 may', () => {
    for (const [cat, n] of [['POLICE', '113'], ['FIRE_RESCUE', '114'], ['MEDICAL', '115']] as const) {
      const t = buildEmergencyTurn({ ...base, category: cat, userLocation: HANOI })
      expect(numbers(t)).toEqual([n])
      expect(t.text).not.toMatch(/24\/7|miễn phí|free|trực/i)
      const en = buildEmergencyTurn({ ...base, lang: 'en', category: cat, userLocation: HANOI })
      expect(en.text).not.toMatch(/24\/7|miễn phí|free|open/i)
    }
    expect(buildEmergencyTurn({ ...base, category: 'CHILD_PROTECTION', userLocation: HANOI }).text).toContain('24/7')
  })
  it('English copy for an English thread', () => {
    const t = buildEmergencyTurn({ ...base, lang: 'en', category: 'FIRE_RESCUE', userLocation: HANOI })
    expect(t.text).toContain(EN['safety.emergency.guidance.knownPlace'])
  })
  it('the annotation carries only what a card shows (no internal notes)', () => {
    const t = buildEmergencyTurn({ ...base, category: 'POLICE', userLocation: HANOI })
    const json = JSON.stringify(t.annotation)
    expect(json).not.toMatch(/transition|notes|Decree/i)
    expect(t.annotation.kind).toBe(SAFETY_ANNOTATION_KIND)
  })
})

describe('buildEmergencyTurn: Simplified Chinese', () => {
  const zh = { ...base, lang: 'zh' as const }
  it('the dictionaries have the same keys in every language and no empty value', () => {
    expect(Object.keys(ZH).sort()).toEqual(Object.keys(VI).sort())
    for (const v of Object.values(ZH)) expect(v.length).toBeGreaterThan(0)
  })
  it('verified Viet Nam position: Chinese guidance and labels, the registry card (Vietnamese name, same number) unchanged', () => {
    const t = buildEmergencyTurn({ ...zh, category: 'FIRE_RESCUE', userLocation: HANOI })
    expect(numbers(t)).toEqual(['114'])
    expect(t.text).toContain(ZH['safety.emergency.title'])
    expect(t.text).toContain(ZH['safety.emergency.guidance.knownPlace'])
    expect(t.text).toContain(ZH['safety.emergency.cat.FIRE_RESCUE'])
    expect(t.text).toContain('Đường dây 114 - Cứu hỏa, cứu nạn cứu hộ: 114')
    expect(t.annotation.cards.map(c => [c.displayName, c.phoneNumber])).toEqual([['Đường dây 114 - Cứu hỏa, cứu nạn cứu hộ', '114']])
  })
  it('🔑 no position or outside Viet Nam: no card, no number, Chinese guidance and ONE Chinese location question', () => {
    for (const loc of [null, BANGKOK]) {
      const t = buildEmergencyTurn({ ...zh, category: 'MEDICAL', userLocation: loc })
      expect(t.payload.hotlineCards).toEqual([])
      expect(t.text).not.toMatch(/\b11[1-5]\b/)
      expect(t.text).toContain(ZH['safety.emergency.guidance.unknownPlace'])
      expect(t.text).toContain(ZH['safety.emergency.askLocation'])
    }
  })
  it('🔑 a thread that already asked (in any language) does not ask again in Chinese', () => {
    for (const q of [ZH, VI, EN]) {
      const prior = [{ role: 'assistant', content: `x\n\n${q['safety.emergency.askLocation']}` }]
      expect(locationAlreadyAsked(prior)).toBe(true)
      const t = buildEmergencyTurn({ ...zh, priorMessages: prior, category: 'MEDICAL', userLocation: null })
      expect(t.text).not.toContain(ZH['safety.emergency.askLocation'])
      expect(t.text).toContain(ZH['safety.emergency.guidance.unknownPlace'])
    }
  })
  it('🔑 113, 114 and 115 never get hours or "free" in Chinese either; 111 does, from the registry', () => {
    for (const [cat, n] of [['POLICE', '113'], ['FIRE_RESCUE', '114'], ['MEDICAL', '115']] as const) {
      const t = buildEmergencyTurn({ ...zh, category: cat, userLocation: HANOI })
      expect(numbers(t)).toEqual([n])
      expect(t.text).not.toMatch(/24\/7|24小时|免费|值班|全天/)
      expect(Object.values(ZH).join(' ')).not.toMatch(/24\/7|24小时|全天/)
    }
    const c = buildEmergencyTurn({ ...zh, category: 'CHILD_PROTECTION', userLocation: HANOI })
    expect(c.text).toContain('24/7')
    expect(c.text).toContain(ZH['safety.emergency.free'])
  })
  it('every category has Chinese copy, and the copy contains no digits (every number comes from the registry)', () => {
    for (const k of ['FIRE_RESCUE', 'MEDICAL', 'CHILD_PROTECTION', 'HUMAN_TRAFFICKING', 'POLICE']) expect(ZH[`safety.emergency.cat.${k}`]).toBeTruthy()
    for (const [k, v] of Object.entries(ZH)) expect(v, k).not.toMatch(/\d/)
  })
})

describe('data stream and reader', () => {
  it('one text frame, one annotation frame, a finish frame; the reader reads the annotation back', async () => {
    const t = buildEmergencyTurn({ ...base, category: 'FIRE_RESCUE', userLocation: HANOI })
    const res = emergencyDataStreamResponse(t, { 'X-Test': '1' })
    expect(res.status).toBe(200)
    expect(res.headers.get('x-vercel-ai-data-stream')).toBe('v1')
    const body = await res.text()
    const lines = body.trim().split('\n')
    expect(lines.map(l => l[0] + l[1])).toEqual(['0:', '8:', 'd:'])
    expect(JSON.parse(lines[0].slice(2))).toBe(t.text)
    expect(readSafetyAnnotation(JSON.parse(lines[1].slice(2)))?.cards.map(c => c.phoneNumber)).toEqual(['114'])
  })
  it('the reader ignores other annotations and malformed ones', () => {
    expect(readSafetyAnnotation(undefined)).toBeNull()
    expect(readSafetyAnnotation([{ kind: 'other' }, null, 5])).toBeNull()
    expect(readSafetyAnnotation([{ kind: SAFETY_ANNOTATION_KIND, cards: 'x' }])).toBeNull()
  })
})
