// The dev test harness's fixtures are only useful if they travel the SAME readers the product's chat uses. These tests send each scenario through those readers
// (parsePlan, parseMediaBlocks, looksLikeReport, readPlacesLiveView) and fail if a fixture would render through nothing real.
import { describe, it, expect } from 'vitest'
import { parsePlan } from '@/lib/structuredContent/parsePlan'
import { parseMediaBlocks } from '@/lib/media/mediaHosts'
import { looksLikeReport } from '@/lib/chat/requestHistory'
import { readPlacesLiveView } from '@/lib/recommendation/liveView'
import { HARNESS_SCENARIOS, HARNESS_STORE_ITEMS, HARNESS_PROJECTS, HARNESS_PROFILES, scenarioByParam, assistantTextOf } from './fixtures'

const byN = (n: number) => HARNESS_SCENARIOS.find(s => s.n === n)!

describe('harness fixtures', () => {
  it('has the six scenarios of the mockup, in order, each with its own conversation id', () => {
    expect(HARNESS_SCENARIOS.map(s => s.n)).toEqual([1, 2, 3, 4, 5, 6])
    expect(new Set(HARNESS_SCENARIOS.map(s => s.conversationId)).size).toBe(6)
    expect(byN(6).kind).toBe('project')
    for (const s of HARNESS_SCENARIOS.filter(x => x.kind === 'chat')) {
      expect(s.messages.length).toBeGreaterThanOrEqual(2)
      expect(s.messages[0].role).toBe('user')
    }
  })

  it('1 Elon vs Sam: the portraits come as a [TAPPY_MEDIA] entities block that the product\'s reader accepts, and the text has a comparison table', () => {
    const text = assistantTextOf(byN(1))
    const { blocks, text: rest } = parseMediaBlocks(text)
    expect(blocks[0]?.kind).toBe('entities')
    expect(rest).toMatch(/\|\s*Khía cạnh\s*\|/)
    expect(rest).not.toContain('[TAPPY_MEDIA]')
  })

  it('2 Tesla: a dated list, a callout and a data table in the answer text', () => {
    const text = assistantTextOf(byN(2))
    expect(text).toMatch(/2003/)
    expect(text).toMatch(/^>\s/m)
    expect(text).toMatch(/\|\s*Thông số/)
  })

  it('3 Thảo Điền: the place cards arrive as a places annotation the product reads, with real action kinds, and none is a Quy Nhơn wireframe', () => {
    const s = byN(3)
    expect(s.placesView).toBeTruthy()
    const view = readPlacesLiveView([s.placesView])
    expect(view?.items.length).toBeGreaterThanOrEqual(2)
    expect(view?.items.every(p => p.actions.length > 0)).toBe(true)
    expect(JSON.stringify(s)).not.toMatch(/Quy Nhơn|Cá Khói/)
  })

  it('4 Đà Lạt: a [TAPPY_PLAN] the product\'s parser decodes to several days, with tips and a cost breakdown', () => {
    const { plan } = parsePlan(assistantTextOf(byN(4)))
    expect(plan?.days.length).toBeGreaterThanOrEqual(3)
    expect(plan?.days.every(d => d.items.length > 0)).toBe(true)
    expect(plan?.local_tips?.length).toBeGreaterThanOrEqual(3)
    expect(Object.keys(plan?.cost_breakdown ?? {}).length).toBeGreaterThanOrEqual(4)
  })

  it('5 Deep Research: long enough, with enough headings, that the product treats it as a report (not as a short answer)', () => {
    const text = assistantTextOf(byN(5))
    expect(text.length).toBeGreaterThanOrEqual(8_000)
    expect((text.match(/^##\s/gm) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(looksLikeReport(text)).toBe(true)
  })

  it('6 Project: the project and the conversations linked to it exist in the store fixture', () => {
    const p = HARNESS_PROJECTS.find(x => x.id === 'p1')!
    expect(p.title).toMatch(/Phú Quốc/)
    const linked = HARNESS_STORE_ITEMS.filter(c => c.project_id === 'p1')
    expect(linked.length).toBe(p.conversationCount)
    expect(linked.length).toBeGreaterThanOrEqual(2)
  })

  it('the sidebar fixture has eight conversations and the six scenario conversations are among them', () => {
    expect(HARNESS_STORE_ITEMS.length).toBe(8)
    for (const s of HARNESS_SCENARIOS.filter(x => x.kind === 'chat')) expect(HARNESS_STORE_ITEMS.some(c => c.id === s.conversationId)).toBe(true)
  })

  it('profiles for the chips are fixed local data with Wikipedia as source and no picture host to reach', () => {
    expect(HARNESS_PROFILES.length).toBeGreaterThanOrEqual(3)
    for (const p of HARNESS_PROFILES) { expect(p.source).toBe('Wikipedia'); expect(p.image).toBeNull() }
  })

  it('scenarioByParam: 1..6, anything else falls back to 1', () => {
    expect(scenarioByParam('4').n).toBe(4)
    expect(scenarioByParam(undefined).n).toBe(1)
    expect(scenarioByParam('99').n).toBe(1)
    expect(scenarioByParam('abc').n).toBe(1)
  })
})
