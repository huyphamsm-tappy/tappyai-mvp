import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { matchWeatherCityInText, weatherPlaceResolution } from '@/lib/ai/tools/cacheKeys'
import { VIETNAM } from '@/lib/ai/tools/cacheKeys'

/**
 * F01 — the morning push must go through the same validated weather pipeline as chat.
 *
 * A push is the worse place for this defect. Nobody asked a question they could sanity-check;
 * the number simply arrives on a phone. Before F01 this cron kept its OWN city table with the
 * same bare-ASCII bug and defaulted every unrecognised location to Ho Chi Minh City, so a user in
 * Huế was pushed another province's weather and had no way to tell.
 *
 * `getWeatherBrief` is module-private, so this proves the property in the two places it can be
 * reached:
 *
 *   BEHAVIOUR   every city it can resolve arrives at `getWeather` fully guarded — right query,
 *               country expected, coordinates expected;
 *   STRUCTURE   the route has no city resolution of its own, and it discards a refused result
 *               instead of formatting it.
 *
 * The structural half matters because the behavioural half cannot see a future edit that
 * reintroduces a private lookup.
 */

const ROUTE = join(__dirname, 'route.ts')
const source = readFileSync(ROUTE, 'utf8')

/** Source with comments stripped — every fix here leaves a comment quoting the very constructs
 *  these assertions look for, and matching raw text makes them fire on prose. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

afterEach(() => { vi.unstubAllGlobals() })

describe('F01 · the push path resolves through the shared table', () => {
  it.each([
    ['Hà Nội', 'Ha Noi, Vietnam'],
    ['TP Hồ Chí Minh', 'Ho Chi Minh City, Vietnam'],
    ['Đà Nẵng', 'Da Nang, Vietnam'],
    ['Huế', 'Thua Thien Hue, Vietnam'],
    ['Hạ Long', 'Hong Gai, Vietnam'],
  ])('a profile saying "%s" reaches getWeather as "%s", fully guarded', (stored, query) => {
    const found = matchWeatherCityInText(stored)
    expect(found).toBe(query)

    // 🔑 The round trip is the load-bearing part. The cron hands `getWeather` whatever this
    // returned, so if that string did not resolve back to the same city it would arrive as a
    // free-form location — right query, no country, no coordinates — and the guard would be
    // silently absent on the push path ONLY. Hạ Long is the case that proves it: its canonical
    // query names a ward, so it does not contain its own city name.
    const round = weatherPlaceResolution(found!)
    expect(round.query).toBe(query)
    expect(round.expectedCountry).toBe(VIETNAM)
    expect(round.expectedCoords).not.toBeNull()
  })

  it('a location it does not recognise yields no city, so the brief omits weather', () => {
    // Never a default city. The old code answered "Ho Chi Minh City" for everything it did not
    // know, which is a silent wrong answer delivered as a notification.
    for (const unknown of ['somewhere else', 'Paris', '', 'johnson']) {
      expect(matchWeatherCityInText(unknown)).toBeNull()
    }
  })
})

describe('F01 · the push path has no weather logic of its own', () => {
  it('resolves cities through the shared helper, not a local table', () => {
    expect(code).toMatch(/matchWeatherCityInText\s*\(/)
  })

  it('fetches through getWeather, never the provider directly', () => {
    expect(code).toMatch(/getWeather\s*\(/)
    expect(code).not.toMatch(/wttr\.in/)
    expect(code).not.toMatch(/nearest_area/)
  })

  it('🚨 carries no city map of its own', () => {
    // The exact shape that was deleted: a local record of city name -> provider string.
    expect(code).not.toMatch(/'(ha noi|da nang|ho chi minh|hue|ha long)'\s*:/i)
    expect(code).not.toMatch(/cityMap/)
  })

  it('🚨 discards a refused result instead of formatting it', () => {
    // getWeather answers a rejected location with { error }. If the brief did not check for it,
    // a wrong-place refusal would become a push reading "undefined°C" — or worse, be formatted
    // from a partial object.
    expect(code).toMatch(/'error'\s+in\s+w/)
  })

  it('never invents a fallback city when nothing matches', () => {
    expect(code).not.toMatch(/\|\|\s*'Ho Chi Minh City'/)
    expect(code).toMatch(/if\s*\(!city\)\s*return\s*''/)
  })
})
