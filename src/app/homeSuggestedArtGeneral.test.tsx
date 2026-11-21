// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { assignCardArt, TOPIC_ART } from './HomeV3'
import { getDynamicPrompts } from '@/lib/suggestedPrompts'

// Owner 21/11/2026: "content one place, picture another". A card outside the five photographed categories (`general`: money, work, study, personal
// decisions) must never borrow a food/travel photograph. It takes a photograph of ITS OWN topic (the owner's pictures), else the mascot.
describe('art for general (non-photographed) categories', () => {
  it('a general card with a topic gets that topic\'s photograph', () => {
    const art = assignCardArt([{ category: 'general', topic: 'money' }, { category: 'food' }, { category: 'general', topic: 'family' }, { category: 'travel' }, { category: 'general', topic: 'news' }])
    expect(art[0]).toBe('/home/topics/money.webp')
    expect(art[2]).toBe('/home/topics/family.webp')
    expect(art[4]).toBe('/home/topics/news.webp')
    expect(art[1]).toMatch(/^\/home\/inspire\/food/)
    expect(art[3]).toMatch(/^\/home\/inspire\/travel/)
  })

  it('two cards on one topic get different pictures of it; a third falls back to the mascot', () => {
    const art = assignCardArt([{ category: 'general', topic: 'money' }, { category: 'general', topic: 'money' }, { category: 'general', topic: 'money' }])
    expect(art[0]).toBe('/home/topics/money.webp')
    expect(art[1]).toBe('/home/topics/money-2.webp')
    expect(art[2]).toMatch(/^\/tappy\//)
  })

  it('a topic with no picture yet (tech, writing) or no topic at all shows the mascot, never another topic\'s photograph', () => {
    const art = assignCardArt([{ category: 'general', topic: 'tech' }, { category: 'general', topic: 'writing' }, { category: 'general' }])
    expect(art.every((a) => /^\/tappy\/[a-z]+\.png$/.test(a))).toBe(true)
    expect(new Set(art).size).toBe(3)
  })

  it('is deterministic', () => {
    const cards = [{ category: 'general', topic: 'work' }, { category: 'general', topic: 'health' }, { category: 'general', topic: 'tech' }]
    expect(assignCardArt(cards)).toEqual(assignCardArt(cards))
  })

  it('every topic picture exists on disk', () => {
    for (const files of Object.values(TOPIC_ART)) for (const f of files) expect(existsSync(`public${f}`), f).toBe(true)
  })

  it('every any-topic prompt the generator can return carries a topic, and only any-topic prompts do', () => {
    const seen = new Map<string, string | undefined>()
    for (let k = 0; k < 60; k++) for (const p of getDynamicPrompts(10 + (k % 10), k % 7, null, null, 5)) seen.set(p.text, p.topic ?? (p.category === 'general' ? undefined : 'n/a'))
    const general = [...seen.entries()].filter(([, t]) => t !== 'n/a')
    expect(general.length).toBeGreaterThan(8)
    for (const [text, topic] of general) expect(topic, text).toBeTruthy()
    for (const [, topic] of seen) expect(['n/a', 'work', 'study', 'money', 'health', 'family', 'news', 'tech', 'writing']).toContain(topic)
  })
})
