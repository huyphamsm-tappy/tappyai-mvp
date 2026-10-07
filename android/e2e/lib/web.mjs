// Web counterpart of every Android flow: Playwright, 412×915 mobile, dark, vi-VN, against UAT.
// The Vercel bypass travels as a header; a seeded account is signed in by writing the
// @supabase/ssr session cookie (the same cookie the web's own sign-in writes) — nothing is typed.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { UAT_BASE, AUDIT_REF, bypassSecret } from './env.mjs'
import { sessionFor } from './supabase.mjs'

const CHUNK = 3180 // @supabase/ssr MAX_CHUNK_SIZE

export async function openWeb({ email = null, dir, chatQuiz = false }) {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', colorScheme: 'dark', acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    extraHTTPHeaders: { 'x-vercel-protection-bypass': bypassSecret(), 'x-vercel-set-bypass-cookie': 'true' },
    recordVideo: dir ? { dir, size: { width: 412, height: 915 } } : undefined,
  })
  const host = new URL(UAT_BASE).hostname
  // First-visit language modal: the choice the web stores, so every run starts in Vietnamese.
  await context.addInitScript(() => { try { localStorage.setItem('tappy_lang', 'vi') } catch {} })
  // The first-chat 3-question quiz (ChatInterface `tappy_onboarded`) is its own flow; elsewhere skip it.
  if (!chatQuiz) await context.addInitScript(() => { try { localStorage.setItem('tappy_onboarded', '1') } catch {} })
  if (email) {
    const s = await sessionFor(email)
    const value = 'base64-' + Buffer.from(JSON.stringify(s)).toString('base64url')
    const name = `sb-${AUDIT_REF}-auth-token`
    const parts = value.length <= CHUNK ? [[name, value]] : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => [`${name}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK)])
    await context.addCookies(parts.map(([n, v]) => ({ name: n, value: v, domain: host, path: '/', secure: true, sameSite: 'Lax' })))
  }
  const page = await context.newPage()
  let step = 0
  const web = {
    page, context,
    go: async (p, wait = 4000) => { await page.goto(UAT_BASE + p, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(wait); await web.dismissLanguage() },
    dismissLanguage: async () => { const vi = page.getByText('Tiếng Việt', { exact: true }); if (await vi.count() && await page.getByText('Chọn ngôn ngữ').count()) { await vi.first().click(); await page.waitForTimeout(800) } },
    shot: async (name, full = false) => { if (!dir) return; fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, `${String(++step).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: f, fullPage: full }); return f },
    close: async () => { await context.close(); await browser.close() },
  }
  return web
}
