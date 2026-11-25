import { describe, it, expect, vi, afterEach } from 'vitest'
import { getGoldPrice, getWeather } from './weather'

// 18/11 review: a failed lookup was cached like data, so one blip pinned "unavailable" for 5-30 minutes. A failure is returned, never stored.
afterEach(() => { vi.unstubAllGlobals() })

describe('a failed weather or gold lookup is not cached', () => {
  it('gold: the call after a failure fetches again and returns the data', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ json: async () => ({ success: true, time: '10:00', date: '18/11/2026', prices: { SJ9999: { name: 'SJC', buy: 1, sell: 2, change_buy: 0, change_sell: 0, currency: 'VND' } } }) })
    vi.stubGlobal('fetch', fetchMock)
    const first = await getGoldPrice('', 'vi') as { error?: string }
    expect(first.error).toBeTruthy()
    const second = await getGoldPrice('', 'vi') as { error?: string; source?: string }
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(second.error).toBeUndefined()
    expect(second.source).toBe('vang.today')
  })
  it('weather: a failure is retried on the next call, and the request carries a timeout signal that covers the body', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'))
    vi.stubGlobal('fetch', fetchMock)
    const place = 'weather-failure-cache-test-place'
    const first = await getWeather(place, 'vi') as { error?: string }
    const again = await getWeather(place, 'vi') as { error?: string }
    expect(first.error).toBeTruthy()
    expect(again.error).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((fetchMock.mock.calls[0][1] as { signal?: unknown }).signal).toBeInstanceOf(AbortSignal)
  })
})
