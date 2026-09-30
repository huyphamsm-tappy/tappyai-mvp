import { describe, expect, it } from 'vitest'
import { areaKeyV2, normalizeQueryV2, serperCacheV2Enabled, serperKeyBodyV2, serperTtlV2 } from './serperCacheV2'
import { serperSharedCacheKey } from './serperCache'

describe('SERPER_CACHE_V2 — key', () => {
  it('is OFF by default and v1 keys are unchanged', () => {
    expect(serperCacheV2Enabled({})).toBe(false)
    expect(serperSharedCacheKey('maps', 'phở Quận 1', null, undefined, {} as unknown as NodeJS.ProcessEnv)).toContain('serper:v1:maps:')
    expect(serperSharedCacheKey('maps', 'phở Quận 1', null, undefined, { SERPER_CACHE_V2: '1' } as unknown as NodeJS.ProcessEnv)).toContain('serper:v2:maps:')
  })

  it('folds the ways the same request is written onto one key', () => {
    const same = ['phở Quận 1', 'phở ở q1', 'Phở, quận 1 TP.HCM', 'phở q.1 tp hcm', 'phở quận 1 Sài Gòn', 'phở District 1']
    expect(new Set(same.map(normalizeQueryV2))).toEqual(new Set(['pho quan 1']))
    expect(normalizeQueryV2('khách sạn Đà Nẵng, Việt Nam')).toBe(normalizeQueryV2('khách sạn da nang'))
    expect(normalizeQueryV2('bún bò Huế gần đây Sài Gòn')).toBe('bun bo hue ho chi minh')
    expect(normalizeQueryV2('quan an ngon quan 3')).toBe(normalizeQueryV2('quán ăn ngon Quận 3'))
  })

  it('never merges different requests (tone-only pairs like mắt/mất DO share — owner spec, see header)', () => {
    expect(normalizeQueryV2('phở quận 1')).not.toBe(normalizeQueryV2('phở quận 10'))
    expect(normalizeQueryV2('khách sạn hà nội')).not.toBe(normalizeQueryV2('khách sạn đà nẵng'))
    expect(serperKeyBodyV2('shopping', 'tai nghe', null, 'n20')).not.toBe(serperKeyBodyV2('shopping', 'tai nghe', null))
  })

  it('keeps coordinates at v1 precision and folds location strings', () => {
    expect(areaKeyV2({ lat: 10.77691, lng: 106.70092 })).toBe('ll=10.78,106.70,14')
    expect(areaKeyV2('TP.HCM')).toBe(areaKeyV2('Ho Chi Minh City, Vietnam'))
    expect(areaKeyV2(null)).toBe('none')
  })
})

describe('SERPER_CACHE_V2 — TTL by what goes stale', () => {
  it('places 3 days, prices 6 h, web 12 h', () => {
    expect(serperTtlV2('maps', 'phở quận 1', {})).toBe(3 * 86_400)
    expect(serperTtlV2('shopping', 'tai nghe bluetooth', {})).toBe(6 * 3_600)
    expect(serperTtlV2('search', 'review máy lọc không khí', {})).toBe(12 * 3_600)
  })
  it('anything tied to today is 1 h on every endpoint', () => {
    for (const q of ['lịch chiếu CGV tối nay', 'sự kiện cuối tuần quận 1', 'giá vàng hôm nay', 'flash sale tai nghe', 'concert 15/10'])
      expect(serperTtlV2(q.startsWith('flash') ? 'shopping' : 'search', q, {})).toBe(3_600)
    expect(serperTtlV2('maps', 'quán nhậu tối nay quận 1', {})).toBe(3_600)
  })
  it('env overrides', () => {
    expect(serperTtlV2('maps', 'phở', { SERPER_CACHE_V2_TTL_MAPS_SECONDS: '600' })).toBe(600)
  })
})
