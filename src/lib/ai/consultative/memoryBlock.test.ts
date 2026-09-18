import { describe, it, expect } from 'vitest'
import { buildConsultativeMemoryBlock, PREF_CAP, CAT_CAP } from './memoryBlock'
import { buildMemoryBlock, type UserMemory } from '@/lib/memory/memoryService'

/**
 * The row a real user accumulates after ~30 ordinary turns under the LEGACY write path
 * (measured 2026-09-18, docs/audit/eval/memory/replay-first20.json, extrapolated): one-off search
 * subjects stored as tastes, a district as a destination, a trip length as a habit.
 */
const LEGACY_LARGE: UserMemory = {
  location_base: 'Sài Gòn',
  discovery_city: 'Đà Nẵng',
  companions: 'gia đình 4 người',
  timing: '3 ngày 2 đêm',
  personality: 'lãng mạn, yên tĩnh',
  preferences: {
    food: ['bún bò', 'phở', 'lẩu', 'hải sản', 'cơm tấm', 'bánh mì', 'sushi', 'bò né'],
    entertainment: ['chỗ đậu xe ô tô', 'phòng riêng', 'khách sạn gần biển', 'karaoke', 'rạp phim'],
    shopping: ['tai nghe bluetooth', 'laptop văn phòng', 'robot hút bụi', 'máy lọc không khí', 'nồi chiên không dầu'],
    spa: ['massage chân', 'gội đầu dưỡng sinh'],
    avoid: ['hải sản (dị ứng)'],
  },
  budget: { food: { min: 0, max: 80000 }, shopping: { min: 5000000, max: 7000000 }, trip: { min: 0, max: 6000000 } },
  history: [
    'quán ăn Quận 1', 'bún bò Quận 1', 'quán ăn lãng mạn Quận 3', 'quán ăn gia đình Phú Nhuận', 'mua laptop văn phòng',
    'robot hút bụi cho nhà có chó', 'trip Đà Nẵng 3 ngày 2 đêm', 'khách sạn Đà Nẵng gần biển',
    'khách sạn Đà Nẵng dưới 1 triệu/đêm, bao gồm ăn sáng', 'trip gần Sài Gòn cuối tuần',
  ],
}

describe('buildConsultativeMemoryBlock — informs the pick, never the question', () => {
  const block = buildConsultativeMemoryBlock(LEGACY_LARGE)

  it('never carries the legacy "ask a short question first" instruction', () => {
    expect(block).not.toMatch(/hoi lai mot cau ngan/)
    expect(block).not.toMatch(/MacBook Pro/)
    expect(block).toMatch(/KHONG BAO GIO hoi lai/)
    expect(block).toMatch(/CHON theo so thich da biet/)
  })

  it('keeps the untrusted fence around the values and the instruction outside it', () => {
    expect(block).toContain('source=user_memory')
    const fenced = block.slice(block.indexOf('source=user_memory'), block.indexOf('⟦/DATA⟧'))
    expect(fenced).toContain('Sài Gòn')
    expect(fenced).not.toContain('KHONG BAO GIO hoi lai')
  })

  it(`caps each preference category at ${PREF_CAP} NEWEST values and the categories at ${CAT_CAP}, avoid first`, () => {
    const line = block.split('\n').find(l => l.startsWith('- So thich da noi ro'))!
    expect(line).toBeDefined()
    // avoid outranks the cap
    expect(line.indexOf('KHONG thich / kieng: hải sản (dị ứng)')).toBeGreaterThan(-1)
    // food: the 4 newest of 8
    expect(line).toContain('cơm tấm, bánh mì, sushi, bò né')
    expect(line).not.toContain('bún bò, phở')
    // 3 categories total: avoid + food + entertainment; shopping and spa are cut
    expect(line.split(';').length).toBe(CAT_CAP)
    expect(line).not.toContain('mua sam')
    expect(line).not.toContain('spa:')
  })

  it('demotes discovery_city and history to one "recently asked about" line marked as history', () => {
    expect(block).not.toMatch(/Diem den dang quan tam/)
    const line = block.split('\n').find(l => l.startsWith('- Gan day da hoi ve'))!
    expect(line).toContain('KHONG phai yeu cau hom nay')
    expect(line).toContain('diem den tung hoi: Đà Nẵng')
    // last 3 history items only, each clipped to 40 chars
    expect(line).toContain('trip gần Sài Gòn cuối tuần')
    expect(line).not.toContain('quán ăn Quận 1,')
    expect(line).toContain('khách sạn Đà Nẵng dưới 1 triệu/đêm')
    expect(line).not.toContain('ăn sáng')
    expect(line).toContain('…')
  })

  it('renders companions / timing / personality as defaults the message overrides', () => {
    const line = block.split('\n').find(l => l.startsWith('- Mac dinh neu tin nhan khong noi'))!
    expect(line).toContain('hay di cung: gia đình 4 người')
    expect(line).toContain('thoi gian hay di: 3 ngày 2 đêm')
    expect(block).not.toMatch(/^- Hay di cung/m)
  })

  it('stays bounded no matter how large the row is', () => {
    const huge: UserMemory = {
      ...LEGACY_LARGE,
      preferences: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`cat${i}`, Array.from({ length: 50 }, (_, j) => `value ${i}-${j} `.repeat(6))])),
      history: Array.from({ length: 50 }, (_, i) => `topic ${i} `.repeat(10)),
    }
    expect(buildConsultativeMemoryBlock(huge).length).toBeLessThan(2_000)
  })

  it('is empty for an empty row and respects the info-only tools like the legacy block', () => {
    expect(buildConsultativeMemoryBlock({ location_base: null, preferences: {}, budget: {}, history: [] })).toBe('')
    const weather = buildConsultativeMemoryBlock(LEGACY_LARGE, 'get_weather')
    expect(weather).toContain('Sài Gòn')
    expect(weather).not.toContain('So thich')
    expect(weather).not.toMatch(/^- Gan day da hoi ve/m)
  })

  it('leaves the legacy block byte-identical (flag OFF path)', () => {
    const legacy = buildMemoryBlock(LEGACY_LARGE)
    expect(legacy).toMatch(/hoi lai mot cau ngan de xac nhan TRUOC KHI tim kiem/)
    expect(legacy).toContain('- Diem den dang quan tam (muon kham pha, KHONG phai noi dang o): Đà Nẵng')
    expect(legacy).toContain('an uong: bún bò, phở, lẩu, hải sản, cơm tấm, bánh mì, sushi, bò né')
  })
})

describe('buildConsultativeMemoryBlock — scoped to the turn\'s domains', () => {
  it('a food turn renders food (+ avoid) only; a travel turn renders trip budget and no tastes; unknown keeps all', () => {
    const food = buildConsultativeMemoryBlock(LEGACY_LARGE, null, { domains: ['food'] })
    expect(food).toContain('an uong: cơm tấm, bánh mì, sushi, bò né')
    expect(food).toContain('KHONG thich / kieng: hải sản (dị ứng)')
    expect(food).not.toContain('mua sam')
    expect(food).not.toContain('giai tri')
    expect(food).toContain('- Budget thuong dung: food: duoi 80.000d')
    expect(food).not.toContain('shopping: 5.000.000')
    const travel = buildConsultativeMemoryBlock(LEGACY_LARGE, null, { domains: ['travel'] })
    expect(travel).not.toContain('an uong')
    expect(travel).toContain('trip: duoi 6.000.000d')
    expect(travel).toContain('KHONG thich / kieng')
    const all = buildConsultativeMemoryBlock(LEGACY_LARGE, null, { domains: [] })
    expect(all).toBe(buildConsultativeMemoryBlock(LEGACY_LARGE))
  })
})
