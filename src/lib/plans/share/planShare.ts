import type { TappyPlan } from '@/components/TripPlanCard'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { absoluteUrl } from '@/lib/share/openGraph'
import { planAmount } from '@/lib/plans/planPrice'

// ── The published plan: what a recipient may see, and nothing else ──────────
//
// A shared plan gets a real page (`/plan/<shareId>`) and a real preview, so for
// the first time a plan is READ BY SOMEONE WHO DOES NOT OWN IT. This module is
// the boundary. `toPlanShareSnapshot` copies named fields off the `[TAPPY_PLAN]`
// payload and validates each; nothing is spread, so `place_id`, `cost_breakdown`,
// the conversation, and any field the model may add later have nowhere to land.
//
// 🚨 THE SNAPSHOT IS THE PLAN, NOT A SECOND PLAN MODEL. Every field here is a
// field of `TappyPlan` (the contract in promptBuilder.ts, mirrored by Android
// and iOS), clipped and checked. Rendering derives from it — `brochureOf` —
// and invents nothing: no dates, no nights, no destination the plan did not
// state, no photo the enrichment step did not attach.
//
// 🚨 PHOTOS ARE ALLOW-LISTED BY HOST, AND THE LIST IS THE CANONICAL PLACE
// IMAGE RULE. `photo_url` is written by `streamEnrichment.injectPlanPhotos`
// from a matched PLACE — a Google place-photo CDN address (Serper thumbnails on
// gstatic, Places photos resolved to googleusercontent). Only those hosts pass.
//
// Deliberately NOT on the list: `storage.googleapis.com`, TappyAI's own media
// bucket. That is where clip and review thumbnails live, and a clip frame is
// not a photo of a place — it must never become a hero or a stop image just so
// the brochure has a picture. A plan that carries such a URL renders WITHOUT
// an image (the page drops the frame entirely); nothing is substituted, no
// stock art, and no extra API call is ever made to find one.

export const PLAN_SHARE_ID_RE = /^[A-Za-z0-9]{12}$/

/** Hosts a canonical place photo may live on. Anchored on the registrable suffix. */
const PHOTO_HOSTS = ['googleusercontent.com', 'gstatic.com', 'ggpht.com']

export function isPlanPhotoUrl(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || !isSafeHttpsUrl(value)) return false
  const host = new URL(value).hostname.toLowerCase()
  return PHOTO_HOSTS.some(h => host === h || host.endsWith(`.${h}`))
}

// Bounds. A plan is a few days of a few stops; anything past this is not a plan
// the product ever produced and is clipped rather than refused.
const MAX_DAYS = 10
const MAX_ITEMS_PER_DAY = 12
const MAX_TITLE = 120
const MAX_LABEL = 60
const MAX_NAME = 120
const MAX_DESC = 240
const MAX_ADDRESS = 200
const MAX_SHORT = 40
const MAX_SUMMARY = 160
const MAX_LINK = 512
/**
 * The row's CHECK is `pg_column_size(plan) <= 65536` — 64 KiB of BYTES. The budget must therefore
 * be measured in UTF-8 BYTES, not characters (F-029): the previous 60_000-CHARACTER budget let a
 * Vietnamese plan (multi-byte diacritics — the primary audience) pass the trim at ~60k chars while
 * its bytes were ~90k+, so the insert hit the CHECK and the share 500'd. 56 KiB leaves ~9.5 KiB of
 * headroom below the CHECK for jsonb's binary overhead vs the JSON text.
 */
export const MAX_SNAPSHOT_BYTES = 56_000

export interface PlanShareItem {
  time?: string
  emoji?: string
  category?: string
  name: string
  description?: string
  price?: string
  address?: string
  maps_link?: string
  booking_link?: string
  photo_url?: string
}

export interface PlanShareDay {
  label: string
  items: PlanShareItem[]
}

export interface PlanShareSnapshot {
  /** Snapshot format. Bumped only if a field is added; a reader must tolerate older rows. */
  v: 1
  type?: 'trip' | 'evening'
  title: string
  people?: number
  budget_total?: string
  /** One short, link-free line of the model's own summary — same rule as the text brochure. */
  summary?: string
  days: PlanShareDay[]
}

const clip = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined
  const s = v.replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, max) : undefined
}

const safeLink = (v: unknown): string | undefined =>
  typeof v === 'string' && isSafeHttpsUrl(v) && v.length <= MAX_LINK ? v : undefined

function pickItem(raw: unknown): PlanShareItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = clip(r.name, MAX_NAME)
  if (!name) return null
  const item: PlanShareItem = { name }
  const time = clip(r.time, MAX_SHORT); if (time) item.time = time
  const emoji = clip(r.emoji, 8); if (emoji) item.emoji = emoji
  const category = clip(r.category, MAX_SHORT); if (category) item.category = category
  const description = clip(r.description, MAX_DESC); if (description) item.description = description
  // Only an actual amount (or "free") is published; a "chưa có giá" sentinel is not a price (planPrice.ts).
  const price = planAmount(clip(r.price, MAX_SHORT)); if (price) item.price = price
  const address = clip(r.address, MAX_ADDRESS); if (address) item.address = address
  const maps = safeLink(r.maps_link); if (maps) item.maps_link = maps
  const booking = safeLink(r.booking_link); if (booking) item.booking_link = booking
  if (isPlanPhotoUrl(r.photo_url as string) && (r.photo_url as string).length <= MAX_LINK) item.photo_url = r.photo_url as string
  return item
}

/**
 * Keeps the snapshot under the row's size check, deterministically: first the
 * descriptions go, then the links, then whole days from the end. Every field
 * cap above is far below what a model emits, so this is the guard for a payload
 * built to hit every cap at once — not a path a real plan takes.
 */
function fitBudget(snap: PlanShareSnapshot): PlanShareSnapshot {
  // BYTES, not characters — the DB CHECK counts pg_column_size (F-029).
  const size = (s: PlanShareSnapshot) => Buffer.byteLength(JSON.stringify(s), 'utf8')
  if (size(snap) <= MAX_SNAPSHOT_BYTES) return snap
  const out: PlanShareSnapshot = { ...snap, days: snap.days.map(d => ({ label: d.label, items: d.items.map(it => ({ ...it })) })) }
  for (const d of out.days) for (const it of d.items) delete it.description
  if (size(out) <= MAX_SNAPSHOT_BYTES) return out
  for (const d of out.days) for (const it of d.items) { delete it.maps_link; delete it.booking_link }
  while (size(out) > MAX_SNAPSHOT_BYTES && out.days.length > 1) out.days.pop()
  return out
}

/**
 * The snapshot for a plan, or null when there is nothing real to publish.
 *
 * Null, not a placeholder, when the plan has no title or no stop: a link to an
 * empty brochure would tell a recipient the sender has a plan they do not have.
 */
export function toPlanShareSnapshot(plan: TappyPlan | null | undefined): PlanShareSnapshot | null {
  if (!plan || typeof plan !== 'object') return null
  const title = clip(plan.title, MAX_TITLE)
  if (!title) return null
  const rawDays = Array.isArray(plan.days) ? plan.days.slice(0, MAX_DAYS) : []
  const days: PlanShareDay[] = []
  rawDays.forEach((d, i) => {
    if (!d || typeof d !== 'object') return
    const items = (Array.isArray(d.items) ? d.items : []).map(pickItem).filter((x): x is PlanShareItem => !!x).slice(0, MAX_ITEMS_PER_DAY)
    if (items.length === 0) return
    // A day is real by its stops; a missing label falls back to its position, which is a fact.
    days.push({ label: clip(d.label, MAX_LABEL) ?? String(i + 1), items })
  })
  if (days.length === 0) return null

  const snap: PlanShareSnapshot = { v: 1, title, days }
  if (plan.type === 'trip' || plan.type === 'evening') snap.type = plan.type
  if (typeof plan.people === 'number' && Number.isFinite(plan.people) && plan.people > 0 && plan.people <= 999) snap.people = Math.floor(plan.people)
  const budget = planAmount(clip(plan.budget_total, MAX_SHORT)); if (budget) snap.budget_total = budget
  // The model's caption may say anything; it contributes one short line and never a link.
  const summary = clip(plan.share_text, MAX_SUMMARY + 1)
  if (summary && summary.length <= MAX_SUMMARY && !/https?:\/\//i.test(summary)) snap.summary = summary
  return fitBudget(snap)
}

/**
 * Reads a stored snapshot back. The row was written by `toPlanShareSnapshot`,
 * but the database is not the type system: everything is re-checked so a hand-
 * edited or older row renders safely or not at all.
 */
export function readPlanShareSnapshot(raw: unknown): PlanShareSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  return toPlanShareSnapshot({
    type: r.type as TappyPlan['type'],
    title: r.title as string,
    people: r.people as number,
    budget_total: r.budget_total as string,
    share_text: r.summary as string,
    days: r.days as TappyPlan['days'],
  })
}

/** Canonical JSON — sorted keys — so the same plan always hashes the same. */
export function canonicalPlanShareJson(snap: PlanShareSnapshot): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort)
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v as object).sort().map(k => [k, sort((v as Record<string, unknown>)[k])]))
    }
    return v
  }
  return JSON.stringify(sort(snap))
}

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** 12 characters of base-62 from the platform CSPRNG, rejection-sampled so every character is uniform. */
export function newPlanShareId(random: (n: number) => Uint8Array = defaultRandom): string {
  let out = ''
  while (out.length < 12) {
    for (const b of random(16)) {
      // 248 = 62 × 4: bytes at or above it would bias the low end of the alphabet.
      if (b < 248) out += ID_ALPHABET[b % 62]
      if (out.length === 12) break
    }
  }
  return out
}

function defaultRandom(n: number): Uint8Array {
  const buf = new Uint8Array(n)
  globalThis.crypto.getRandomValues(buf)
  return buf
}

export function planSharePath(id: string): string {
  return `/plan/${id}`
}

/** The canonical public URL of a published plan — passes `isShareableUrl`. */
export function planShareUrl(id: string, env?: NodeJS.ProcessEnv): string {
  return absoluteUrl(planSharePath(id), env)
}

// ── The brochure model: derived, never invented ─────────────────────────────

export interface BrochureHighlight {
  name: string
  photo: string
}

export interface PlanBrochure {
  snapshot: PlanShareSnapshot
  /** The first canonical stop photo. Null when the plan has none — the hero is then text only, with no image frame. */
  hero: string | null
  dayCount: number
  stopCount: number
  /** Up to four distinct real photos, each with the stop it belongs to. */
  highlights: BrochureHighlight[]
}

export function brochureOf(snapshot: PlanShareSnapshot): PlanBrochure {
  const items = snapshot.days.flatMap(d => d.items)
  const seen = new Set<string>()
  const highlights: BrochureHighlight[] = []
  for (const it of items) {
    if (!it.photo_url || seen.has(it.photo_url)) continue
    seen.add(it.photo_url)
    highlights.push({ name: it.name, photo: it.photo_url })
    if (highlights.length === 4) break
  }
  return {
    snapshot,
    hero: highlights[0]?.photo ?? null,
    dayCount: snapshot.days.length,
    stopCount: items.length,
    highlights,
  }
}
