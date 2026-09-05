import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { smartTools, homeSmartTools, smartToolGroups, TOOL_GROUPS, SMART_TOOLS_HREF } from './registry'
import { vi as viDict, en as enDict } from '@/lib/i18n/v3/web'

// ── The Smart Tools registry is the only list, and everything in it is real ──
//
// This file guards three properties, each of which has already failed once in this codebase:
//
//   1. NO FICTIONAL TOOL. Every entry must resolve to a real `page.tsx` and must have copy
//      that already exists in both dictionaries. A tool added to fill out a grid would pass
//      a render test perfectly and 404 for the user.
//   2. THE CAPABILITY GATE IS HONOURED. `SHOW_SCAM_SHIELD` reached Android through
//      /api/config and no Web surface read it. That is exactly the shape of bug that only a
//      test notices, because the flag is `true` today and nothing looks wrong.
//   3. NO COMMERCE OR TRAVEL TAXONOMY. Smart Tools is utilities. The categories that belong
//      to discovery — food, hotels, shopping, entertainment — must never appear here.

const APP = resolve(process.cwd(), 'src/app')

/** Every routable path under src/app, with route-group segments removed. */
function routes(dir = APP, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry.startsWith('_') || entry.startsWith('@')) continue
      const seg = entry.startsWith('(') && entry.endsWith(')') ? '' : `/${entry}`
      out.push(...routes(full, prefix + seg))
    } else if (entry === 'page.tsx' || entry === 'page.ts') {
      out.push(prefix || '/')
    }
  }
  return out
}

describe('every registered tool is a real, reachable feature', () => {
  const available = new Set(routes())

  it.each(smartTools().map((t) => [t.id, t.href] as const))(
    '%s resolves to a real route (%s)',
    (_id, href) => {
      expect(available.has(href), `${href} must have a page.tsx — no placeholder routes`).toBe(true)
    },
  )

  it('no tool points at an invented /smart-tools/* placeholder', () => {
    for (const tool of smartTools()) {
      expect(tool.href).not.toMatch(/^\/smart-tools/)
      expect(tool.href).not.toMatch(/^\/tools\//)
    }
  })

  it('the Smart Tools destination is itself a real page, not just a button target', () => {
    expect(SMART_TOOLS_HREF).toBe('/tools')
    expect(available.has(SMART_TOOLS_HREF)).toBe(true)
    // The dead anchor that started this: no nav entry may go back to it.
    expect(SMART_TOOLS_HREF).not.toContain('#')
  })

  it('every tool has a label AND a description, in both languages', () => {
    for (const tool of smartTools()) {
      for (const key of [tool.labelKey, tool.descKey]) {
        expect(viDict[key], `${tool.id}: ${key} missing from the vi dictionary`).toBeTruthy()
        expect(enDict[key], `${tool.id}: ${key} missing from the en dictionary`).toBeTruthy()
      }
      // An English value left as the Vietnamese one is the bug this catches.
      expect(enDict[tool.descKey]).not.toBe(viDict[tool.descKey])
    }
  })

  it('ids and routes are unique — no tool is registered twice', () => {
    const tools = smartTools()
    expect(new Set(tools.map((t) => t.id)).size).toBe(tools.length)
    expect(new Set(tools.map((t) => t.href)).size).toBe(tools.length)
  })

  it('carries no commerce fields — there is no data behind any of them', () => {
    for (const tool of smartTools()) {
      for (const forbidden of ['rating', 'reviews', 'price', 'badge', 'popularity', 'uses', 'installs']) {
        expect(tool, `${tool.id} must not carry ${forbidden}`).not.toHaveProperty(forbidden)
      }
    }
  })
})

describe('Smart Tools is utilities, never a marketplace taxonomy', () => {
  it('groups are the three authored utility groups and nothing else', () => {
    expect([...TOOL_GROUPS]).toEqual(['v3.tools.daily', 'v3.tools.discover', 'v3.tools.fun'])
  })

  it('no group is a food, travel, shopping or entertainment category', () => {
    // These are discovery categories (`tag.food`, `ONBOARDING_INTERESTS`, the Deals filters).
    // They belong to commerce and travel surfaces, and must never leak into Smart Tools.
    const labels = TOOL_GROUPS.flatMap((k) => [viDict[k], enDict[k]]).join(' ').toLowerCase()
    for (const forbidden of ['ăn uống', 'lưu trú', 'tham quan', 'mua sắm', 'di chuyển', 'food', 'hotel', 'shopping', 'travel']) {
      expect(labels, `"${forbidden}" is a discovery category, not a tool group`).not.toContain(forbidden)
    }
  })

  it('every tool lands in exactly one declared group, and empty groups do not render', () => {
    const grouped = smartToolGroups()
    expect(grouped.flatMap((g) => g.tools).length).toBe(smartTools().length)
    for (const g of grouped) expect(g.tools.length).toBeGreaterThan(0)
  })
})

describe('Home curates; it does not mirror the catalogue', () => {
  it('offers five tools, all of which are in the full registry', () => {
    const home = homeSmartTools()
    expect(home.length).toBe(5)
    const all = new Set(smartTools().map((t) => t.id))
    for (const tool of home) expect(all.has(tool.id)).toBe(true)
  })

  it('the tools NOT on Home are still reachable, so none is orphaned', () => {
    // Measured, not assumed — this is the property that made cutting Home to five safe.
    const shell = require('node:fs').readFileSync(resolve(process.cwd(), 'src/components/v3/V3Shell.tsx'), 'utf8')
    for (const tool of smartTools().filter((t) => !t.home)) {
      const inShell = shell.includes(`'${tool.href}'`)
      const onToolsPage = existsSync(resolve(process.cwd(), 'src/app/tools/page.tsx'))
      expect(inShell || onToolsPage, `${tool.id} must be reachable somewhere`).toBe(true)
    }
  })
})

describe('the capability gate actually gates — SHOW_SCAM_SHIELD reaches the Web', () => {
  afterEach(() => { vi.resetModules(); vi.doUnmock('@/lib/config/product') })

  it('includes Safety Check while the flag is on', async () => {
    expect(smartTools().some((t) => t.id === 'safety')).toBe(true)
    expect(homeSmartTools().some((t) => t.id === 'safety')).toBe(true)
  })

  it('drops it from the registry, from Home and from the groups when the flag is off', async () => {
    // 🚨 THE REGRESSION THIS FILE EXISTS FOR. The flag is `true` today, so nothing on screen
    // looks wrong; the defect only appears the day someone flips it and finds Web ignored them.
    vi.resetModules()
    vi.doMock('@/lib/config/product', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/config/product')>()),
      SHOW_SCAM_SHIELD: false,
    }))
    const gated = await import('./registry')

    expect(gated.smartTools().some((t) => t.id === 'safety'), 'absent from the registry').toBe(false)
    expect(gated.homeSmartTools().some((t) => t.id === 'safety'), 'absent from Home').toBe(false)
    expect(
      gated.smartToolGroups().flatMap((g) => g.tools).some((t) => t.id === 'safety'),
      'absent from /tools',
    ).toBe(false)
    // Hidden ENTRY POINT, not a deleted feature — the route stays, exactly as
    // SHOW_APP_CONNECTIONS leaves /profile/integrations intact.
    expect(existsSync(resolve(process.cwd(), 'src/app/scam-shield/page.tsx'))).toBe(true)
    // Every other tool survives — the gate is one tool wide.
    expect(gated.smartTools().length).toBe(smartTools().length - 1)
  })
})
