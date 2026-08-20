import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { requestLocale, normalizeLocale, DEFAULT_LOCALE } from './requestLocale'
import { serverMessage, SERVER_MESSAGES, type ServerMessageKey } from './serverMessages'

/**
 * B04 — server-generated user-facing text follows the caller's language.
 *
 * The final UAT hit the anonymous message cap on production with the app set to English and got
 * back, in an otherwise entirely English session:
 *
 *   "Bạn đã dùng hết 5 câu hỏi miễn phí hôm nay. Đăng nhập để tiếp tục trò chuyện với Tappy!"
 *
 * The locale plumbing already existed — `?lang=` then `Accept-Language` then `vi` — but it had
 * been copy-pasted into four route files, so routes that happened to have it localized their text
 * and routes that did not, did not. `requestLocale` is now the single place that decides.
 */

const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i

const req = (opts: { lang?: string; accept?: string }) => ({
  url: `http://localhost/api/x${opts.lang ? `?lang=${opts.lang}` : ''}`,
  headers: new Headers(opts.accept ? { 'accept-language': opts.accept } : {}),
})

describe('the request decides the language', () => {
  it('?lang=en is English, ?lang=vi is Vietnamese', () => {
    expect(requestLocale(req({ lang: 'en' }))).toBe('en')
    expect(requestLocale(req({ lang: 'vi' }))).toBe('vi')
  })

  it('Accept-Language is used when ?lang= is absent', () => {
    expect(requestLocale(req({ accept: 'en-US,en;q=0.9' }))).toBe('en')
    expect(requestLocale(req({ accept: 'vi-VN,vi;q=0.9' }))).toBe('vi')
  })

  it('🚨 ?lang= WINS over Accept-Language', () => {
    // The case that makes the order matter rather than being a detail. TappyAI keeps its locale
    // in localStorage, not in the browser's settings, so a user who switched the app to English
    // inside a Vietnamese-configured browser sends exactly this combination. Honouring the header
    // here would override the choice they made in the app.
    expect(requestLocale(req({ lang: 'en', accept: 'vi-VN,vi;q=0.9' }))).toBe('en')
    expect(requestLocale(req({ lang: 'vi', accept: 'en-US' }))).toBe('vi')
  })

  it('a missing, unknown or malformed locale falls back to Vietnamese', () => {
    expect(requestLocale(req({}))).toBe(DEFAULT_LOCALE)
    expect(requestLocale(req({ lang: 'fr' }))).toBe('vi')
    expect(requestLocale(req({ lang: '' }))).toBe('vi')
    expect(requestLocale(req({ accept: '*' }))).toBe('vi')
    expect(normalizeLocale(null)).toBe('vi')
    expect(normalizeLocale(undefined)).toBe('vi')
  })

  it('regional English variants are English', () => {
    for (const tag of ['en', 'EN', 'en-US', 'en-GB', 'en-AU']) {
      expect(normalizeLocale(tag), tag).toBe('en')
    }
  })

  it('a request with no headers bag at all does not throw', () => {
    // Not hypothetical — several suites in this repo build request doubles without one, and a
    // wording lookup must never be able to 500 the endpoint it decorates.
    expect(requestLocale({ url: 'http://localhost/api/x' })).toBe('vi')
    expect(requestLocale({} as never)).toBe('vi')
  })
})

describe('every server message exists in both languages and they differ', () => {
  const keys = Object.keys(SERVER_MESSAGES) as ServerMessageKey[]

  it('there are messages to check', () => {
    expect(keys.length).toBeGreaterThan(5)
  })

  for (const key of keys) {
    it(`${key}`, () => {
      const vi = serverMessage(key, 'vi')
      const en = serverMessage(key, 'en')
      expect(vi.length).toBeGreaterThan(0)
      expect(en.length).toBeGreaterThan(0)
      // An untranslated entry — the same sentence pasted into both slots — is the failure this
      // catches, and it is the failure that produced B04 in the first place.
      expect(en).not.toBe(vi)
      expect(VIETNAMESE.test(en), `${key} EN still contains Vietnamese`).toBe(false)
    })
  }

  it('placeholders are substituted, not left as literals', () => {
    const en = serverMessage('chat.anonLimit', 'en', { n: 5 })
    const vi = serverMessage('chat.anonLimit', 'vi', { n: 5 })
    expect(en).toContain('5')
    expect(vi).toContain('5')
    expect(en).not.toContain('{n}')
    expect(vi).not.toContain('{n}')
  })

  it('leaks no implementation detail', () => {
    // Server error text is the easiest place to hand an attacker a map of the system.
    for (const key of keys) {
      for (const locale of ['vi', 'en'] as const) {
        const m = serverMessage(key, locale)
        expect(m, key).not.toMatch(/anthropic|openai|claude|gpt|supabase|redis|postgres|vercel/i)
        expect(m, key).not.toMatch(/at \w+\.\w+|stack|undefined|null|Error:/i)
      }
    }
  })
})

describe('no API route hardcodes user-facing Vietnamese any more', () => {
  function routeFiles(dir: string): string[] {
    const out: string[] = []
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) out.push(...routeFiles(p))
      else if (e === 'route.ts') out.push(p.replace(/\\/g, '/'))
    }
    return out
  }
  const files = routeFiles('src/app/api')

  it('there are route files to check', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  it('no `message:` field is a Vietnamese literal', () => {
    // The exact shape B04 was: a human sentence, in one language, on the way out of an API.
    const offenders: string[] = []
    for (const f of files) {
      readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return
        const m = line.match(/\bmessage:\s*[`'"]([^`'"]*)[`'"]/)
        if (m && VIETNAMESE.test(m[1])) offenders.push(`${f}:${i + 1} ${m[1].slice(0, 40)}`)
      })
    }
    expect(offenders).toEqual([])
  })

  it('the three routes the UAT identified resolve the locale from the request', () => {
    for (const f of [
      'src/app/api/chat/route.ts',
      'src/app/api/translate/route.ts',
      'src/app/api/auth/anonymous/route.ts',
    ]) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).toContain('requestLocale(req)')
      expect(src, f).toContain('serverMessage(')
    }
  })

  it('the machine-readable error codes were NOT translated', () => {
    // 🚨 The half of this fix that could quietly break every client. `error` is contract —
    // `anon_limit_reached`, `rate_limit`, `too_long` — and clients branch on it. Only the human
    // `message` moves.
    const chat = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(chat).toContain("error: 'anon_limit_reached'")
    expect(chat).toContain("error: 'free_limit_reached'")
    const translate = readFileSync('src/app/api/translate/route.ts', 'utf8')
    expect(translate).toContain("error: 'rate_limit'")
    expect(translate).toContain("error: 'too_long'")
    const anon = readFileSync('src/app/api/auth/anonymous/route.ts', 'utf8')
    expect(anon).toContain("error: 'rate_limit'")
  })
})
