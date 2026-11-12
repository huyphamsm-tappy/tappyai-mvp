import { describe, it, expect } from 'vitest'
import { buildEmergencyTurn, emergencyDataStreamResponse, locationAlreadyAsked, readSafetyAnnotation, SAFETY_ANNOTATION_KIND } from './emergencyResponse'
import { vi as VI, en as EN } from '@/lib/i18n/w5/safetyEmergency'

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
    expect(numbers(buildEmergencyTurn({ ...base, category: 'CHILD_PROTECTION', userLocation: HANOI }))).toEqual(['111'])
    expect(numbers(buildEmergencyTurn({ ...base, category: 'HUMAN_TRAFFICKING', userLocation: HANOI }))).toEqual(['111'])
    expect(numbers(buildEmergencyTurn({ ...base, category: 'POLICE', userLocation: HANOI }))).toEqual(['113'])
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
