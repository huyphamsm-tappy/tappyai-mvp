import {
  ScanText, Calculator, Languages, ArrowLeftRight, ShieldCheck,
  Star, Users, Music2, Sparkle, PenLine,
} from 'lucide-react'
import { SHOW_SCAM_SHIELD, SHOW_MUSIC } from '@/lib/config/product'

// ── Smart Tools — THE registry ──────────────────────────────────────────────
//
// 🚨 THIS FILE EXISTS BECAUSE THERE WERE THREE LISTS AND NO REGISTRY.
//
// The same ten tools were written out inline in `HomeV3.tsx` (five of them), again in
// `V3Shell.tsx`'s sidebar (four more, plus Scam Shield), and a third time in
// `ios/.../HomeSectionViews.swift`. Two of those are Web, and two hand-maintained lists of
// the same thing drift — which is exactly how `/#smart-tools` came to be a nav target with
// no anchor behind it, and how `SHOW_SCAM_SHIELD` came to gate Android while Web ignored it.
//
// This is the ONE Web list. Home renders a curated slice of it, `/tools` renders all of it,
// and the shell's Scam Shield row reads it so the capability gate cannot be forgotten in one
// place and honoured in another. It is NOT a second registry — it is the first one, and the
// two inline lists now consume it.
//
// 🚨 iOS IS DELIBERATELY UNTOUCHED. This is a Web-first task. `HomeSectionViews.swift` keeps
// its own list and its own behaviour; nothing here changes what a phone renders.
//
// 🚨 EVERY ENTRY IS AN EXISTING ROUTE WITH EXISTING COPY. Nothing was invented to fill a
// grid: each `href` resolves to a real `page.tsx`, and each `labelKey`/`descKey` was already
// authored in `src/lib/i18n/v3/web.ts` in both languages. The icons, tones and the three
// group names are the ones the approved Home layout used before Home was cut to one row —
// recovered rather than re-imagined.
//
// 🚨 NO RATINGS, COUNTS, PRICES, BADGES OR POPULARITY. A tool has an identity, a purpose and
// a destination. There is no data behind anything else, and a field here invites a render.

export interface SmartTool {
  /** Stable id — for test assertions and React keys. Never rendered. */
  id: string
  /** The tool's REAL route. Nothing here points at a placeholder. */
  href: string
  labelKey: string
  descKey: string
  icon: typeof ScanText
  /** Accent for the glyph tile only; never the sole carrier of meaning. */
  tone: string
  /** Which of the three authored groups the tool belongs to. */
  group: 'v3.tools.daily' | 'v3.tools.discover' | 'v3.tools.fun'
  /** Curated onto Home. The five the approved reference shows — the Everyday group. */
  home: boolean
  /**
   * The route redirects a signed-out visitor to /login.
   *
   * 🚨 PRESENTATIONAL ONLY, AND IT GATES NOTHING. The page's own server-side check is what
   * actually protects it; this flag exists so the card can SAY so rather than let someone
   * tap into a redirect with no explanation. Measured per route, not assumed.
   */
  auth?: true
}

/** The three groups, in the order the approved layout names them. */
export const TOOL_GROUPS = ['v3.tools.daily', 'v3.tools.discover', 'v3.tools.fun'] as const

/**
 * Every Smart Tool the Web product has, before capability filtering.
 *
 * 🚨 DO NOT READ THIS DIRECTLY FROM A COMPONENT. Use `smartTools()` / `homeSmartTools()` —
 * they apply the capability gate, and a component that skips them renders a tool the product
 * has switched off.
 */
const ALL: readonly SmartTool[] = [
  // ── Everyday — the five Home curates ──────────────────────────────────────
  { id: 'scan', href: '/scan', labelKey: 'v3.tool.scan', descKey: 'v3.tool.scanDesc', icon: ScanText, tone: 'var(--v3-accent)', group: 'v3.tools.daily', home: true },
  { id: 'translate', href: '/translate', labelKey: 'v3.tool.translate', descKey: 'v3.tool.translateDesc', icon: Languages, tone: 'var(--v3-accent)', group: 'v3.tools.daily', home: true },
  { id: 'currency', href: '/currency', labelKey: 'v3.tool.currency', descKey: 'v3.tool.currencyDesc', icon: ArrowLeftRight, tone: 'var(--v3-emerald)', group: 'v3.tools.daily', home: true },
  { id: 'split', href: '/split-bill', labelKey: 'v3.tool.split', descKey: 'v3.tool.splitDesc', icon: Calculator, tone: 'var(--v3-amber)', group: 'v3.tools.daily', home: true },
  { id: 'safety', href: '/scam-shield', labelKey: 'v3.tool.safety', descKey: 'v3.tool.safetyDesc', icon: ShieldCheck, tone: 'var(--v3-emerald)', group: 'v3.tools.daily', home: true },

  // ── Discover ──────────────────────────────────────────────────────────────
  { id: 'suggest', href: '/recommendations', labelKey: 'v3.tool.suggest', descKey: 'v3.tool.suggestDesc', icon: Star, tone: 'var(--v3-amber)', group: 'v3.tools.discover', home: false },
  // The only auth-gated tool: `/group/new` redirects a signed-out visitor to /login. Measured.
  { id: 'together', href: '/group/new', labelKey: 'v3.tool.together', descKey: 'v3.tool.togetherDesc', icon: Users, tone: 'var(--v3-rose)', group: 'v3.tools.discover', home: false, auth: true },
  { id: 'music', href: '/music', labelKey: 'v3.tool.music', descKey: 'v3.tool.musicDesc', icon: Music2, tone: 'var(--v3-violet)', group: 'v3.tools.discover', home: false },

  // ── Fun ───────────────────────────────────────────────────────────────────
  { id: 'fortune', href: '/boi', labelKey: 'v3.tool.fortune', descKey: 'v3.tool.fortuneDesc', icon: Sparkle, tone: 'var(--v3-violet)', group: 'v3.tools.fun', home: false },
  { id: 'captions', href: '/viet-content', labelKey: 'v3.tool.captions', descKey: 'v3.tool.captionsDesc', icon: PenLine, tone: 'var(--v3-rose)', group: 'v3.tools.fun', home: false },
]

/**
 * The tools this build actually offers.
 *
 * 🚨 THE CAPABILITY GATE, AND THE DEFECT IT CLOSES. `SHOW_SCAM_SHIELD` is exported to native
 * through `GET /api/config` and was read by NO Web surface: flipping it to false would have
 * hidden the tool on Android and left it on Home, on the sidebar and on this page. The
 * convention is the one `SHOW_APP_CONNECTIONS` already uses in `ProfileRows` — a hidden
 * ENTRY POINT, with the route and its APIs left intact — so a gated tool is absent, not
 * greyed out. Nothing else here is flag-gated, because no other flag exists for these tools.
 */
export function smartTools(): SmartTool[] {
  return ALL.filter((tool) => {
    if (tool.id === 'safety') return SHOW_SCAM_SHIELD
    // Music is gated off on every platform while its licensing is open (`SHOW_MUSIC`). The row
    // stays in ALL so the tile, its copy and its skin come back with one boolean.
    if (tool.id === 'music') return SHOW_MUSIC
    return true
  })
}

/** The five Home curates — Home is an entry point, not the catalogue. */
export function homeSmartTools(): SmartTool[] {
  return smartTools().filter((tool) => tool.home)
}

/** The available tools, in their three authored groups. Empty groups do not survive. */
export function smartToolGroups(): { titleKey: (typeof TOOL_GROUPS)[number]; tools: SmartTool[] }[] {
  const available = smartTools()
  return TOOL_GROUPS
    .map((titleKey) => ({ titleKey, tools: available.filter((t) => t.group === titleKey) }))
    .filter((g) => g.tools.length > 0)
}

/**
 * The Smart Tools destination.
 *
 * 🔑 A REAL ROUTE, NOT A BUTTON TARGET. `/tools` has a `page.tsx`; the shell's sidebar row and
 * its tab both pointed at `/#smart-tools`, an anchor no element in the codebase ever carried,
 * so both silently scrolled to the top of Home. This is the constant both now use, and Home's
 * "see all" with them.
 */
export const SMART_TOOLS_HREF = '/tools'
