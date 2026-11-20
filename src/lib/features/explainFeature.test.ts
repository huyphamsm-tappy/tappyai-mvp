import { describe, it, expect } from 'vitest'
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { explainFeature, featureTopics } from './explainFeature'
import { webFeatures } from '@/lib/i18n/features'
import { PLAN_CONFIG } from '@/lib/plans/planConfig'
import { DEEP_RESEARCH_MONTHLY } from '@/lib/plans/tiers'
import { ANON_LIFETIME_LIMIT } from '@/lib/config/product'

// Owner 20/11: "Tappy tu giai thich moi tinh nang cho nguoi khong biet dung". The tool answers from ONE place: the shared how-to-use guide (the page /how-to-use, held equal with the mobile apps)
// plus the web-only features of lib/i18n/features.ts. It never invents: no match means "not listed", with the list of topics to offer.
const ids = (topic: string, lang: 'vi' | 'en' = 'vi') => explainFeature(topic, lang).matches.map(m => m.id)

describe('explainFeature: finds the feature a person asks about, in either language', () => {
  it('web-only features: deep research, trip plans, plans and payment, memory, my plans', () => {
    expect(ids('nghiên cứu sâu là gì')[0]).toBe('deep_research')
    expect(ids('how do I download a deep research report as PDF', 'en')[0]).toBe('deep_research')
    expect(ids('làm sao chia sẻ kế hoạch du lịch cho bạn')[0]).toBe('trip_plan')
    expect(ids('how can I share my trip plan', 'en')[0]).toBe('trip_plan')
    expect(ids('mua thêm gói nâng cấp lên Tappy')[0]).toBe('plans_billing')
    expect(ids('how do I upgrade my plan and pay', 'en')[0]).toBe('plans_billing')
    expect(ids('xóa bộ nhớ Tappy nhớ gì về tôi')[0]).toBe('memory')
    expect(ids('xem lại kế hoạch cũ của tôi')).toContain('planner')
  })
  it('the first question of a newcomer, "what can Tappy do", gets the overview, with a topic of only general words too', () => {
    expect(ids('Tappy làm được những gì')[0]).toBe('overview')
    expect(ids('what can you do', 'en')[0]).toBe('overview')
    expect(ids('tính năng của Tappy')[0]).toBe('overview')
    expect(ids('tôi mới dùng, bắt đầu từ đâu')[0]).toBe('overview')
    const o = explainFeature('Tappy làm được những gì', 'vi').matches[0]
    expect(o.more.length).toBeGreaterThanOrEqual(3)
  })
  it('features of the shared guide: saving a place, notifications, the smart tools, voice', () => {
    for (const [topic, id] of [['lưu địa điểm yêu thích', 'saved'], ['thông báo', 'notifications'], ['công cụ tiện ích', 'tools'], ['nghe Tappy đọc to câu trả lời', 'listening']] as const) {
      expect(ids(topic), topic).toContain(id)
    }
  })
  it('a match carries what the feature is, its steps and the notes, in the language asked', () => {
    const vi = explainFeature('nghiên cứu sâu', 'vi').matches[0]
    const en = explainFeature('deep research', 'en').matches[0]
    expect(vi.title).toBe('Nghiên cứu sâu')
    expect(en.title).toBe('Deep Research')
    for (const m of [vi, en]) { expect(m.what.length).toBeGreaterThan(20); expect(m.steps.length).toBeGreaterThanOrEqual(2) }
  })
})

describe('explainFeature: never invents', () => {
  it('an unknown topic is "not found" with the topics Tappy can explain, and no match', () => {
    const r = explainFeature('xyzzy plugh quantum toaster', 'en')
    expect(r.found).toBe(false)
    expect(r.matches).toEqual([])
    expect(r.topics.length).toBeGreaterThanOrEqual(10)
    expect(r.note).toMatch(/not listed|do not invent/i)
  })
  it('an empty or non-string topic is not found too', () => {
    expect(explainFeature('', 'vi').found).toBe(false)
    expect(explainFeature(undefined as unknown as string, 'vi').found).toBe(false)
  })
  it('at most two matches are returned', () => {
    expect(explainFeature('kế hoạch', 'vi').matches.length).toBeLessThanOrEqual(2)
  })
  it('the topic list is the same for both languages in size and covers the shared guide and the web-only features', () => {
    expect(featureTopics('vi').length).toBe(featureTopics('en').length)
    expect(featureTopics('vi').length).toBeGreaterThanOrEqual(webFeatures().length + 11)
  })
})

describe('the numbers come from the code that enforces them', () => {
  it('prices, Deep Research allowances and the visitor limit in the explanation equal the constants', () => {
    const plans = explainFeature('gói và thanh toán', 'vi').matches.find(m => m.id === 'plans_billing')!
    const text = [plans.what, ...plans.steps, ...plans.more].join(' ')
    for (const n of [PLAN_CONFIG.momo.priceVnd, PLAN_CONFIG.coco.priceVnd, PLAN_CONFIG.promax1m.priceVnd, PLAN_CONFIG.promax3m.priceVnd]) expect(text).toContain((n ?? 0).toLocaleString('vi-VN'))
    expect(text).toContain(`${ANON_LIFETIME_LIMIT} câu`)
    const dr = explainFeature('nghiên cứu sâu', 'vi').matches[0]
    const t2 = dr.more.join(' ')
    expect(t2).toContain(`${DEEP_RESEARCH_MONTHLY.pro} lượt Nghiên cứu sâu, gói Tappy có ${DEEP_RESEARCH_MONTHLY.promax} lượt`)
    expect(t2).not.toMatch(/Standard|Advanced/) // owner 20/11/2026: one allowance, no kinds named to the person
  })
  it('the upgrade rule is explained as the code enforces it: up yes (days kept), down no', () => {
    const t = explainFeature('nâng cấp gói', 'vi').matches.find(m => m.id === 'plans_billing')!.more.join(' ')
    expect(t).toMatch(/nâng cấp/)
    expect(t).toMatch(/không hạ/)
    expect(t).toMatch(/cộng dồn/)
  })
})

describe('the web-only catalog is honest', () => {
  const routeExists = (path: string): boolean => {
    // an app route is src/app/<optional (group) folders>/<path>/page.tsx
    const segs = path.split('/').filter(Boolean)
    const walk = (dir: string, i: number): boolean => {
      if (i === segs.length) return existsSync(join(dir, 'page.tsx'))
      let entries: Array<{ name: string; isDirectory(): boolean }> = []
      try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return false }
      for (const e of entries) {
        if (!e.isDirectory()) continue
        if (e.name === segs[i] && walk(join(dir, e.name), i + 1)) return true
        if (/^\(.+\)$/.test(e.name) && walk(join(dir, e.name), i)) return true
      }
      return false
    }
    return walk(join(process.cwd(), 'src/app'), 0)
  }
  it('every page a feature points to exists in the app', () => {
    for (const f of webFeatures()) if (f.where) expect(routeExists(f.where), `${f.id} -> ${f.where}`).toBe(true)
  })
  it('both languages have the same ids and the same number of steps and notes', () => {
    for (const f of webFeatures()) {
      expect(f.vi.steps.length, f.id).toBe(f.en.steps.length)
      expect(f.vi.more.length, f.id).toBe(f.en.more.length)
      expect(f.vi.title.length).toBeGreaterThan(0)
      expect(f.en.what.length).toBeGreaterThan(20)
    }
  })
  it('hidden features (translate, fortune telling) are not offered', () => {
    const all = JSON.stringify(featureTopics('vi')).toLowerCase() + JSON.stringify(featureTopics('en')).toLowerCase()
    expect(all).not.toMatch(/dịch|translate|xem bói|fortune|tarot/)
  })
})
