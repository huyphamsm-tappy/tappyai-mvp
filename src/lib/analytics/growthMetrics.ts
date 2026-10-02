// ─────────────────────────────────────────────────────────────────────────────
// G1 growth metrics — computed from the seven canonical events, nothing else.
//
// PURE. This module takes rows and returns numbers; it never queries. That is
// what makes every definition testable against a hand-built event stream, and
// what keeps the definitions in ONE place (analytics-contract.ts + here) rather
// than spread across SQL, a dashboard and a spreadsheet.
//
// IDENTITY. Events carry `user_id` (registered) or `anon_id` (anonymous). The
// stitch map (`anon_identity_map`) resolves an anon_id to the user it became,
// so a visitor who queried anonymously and then signed up is ONE person across
// the boundary. Everything below counts resolved identities.
//
// DEDUPLICATION. Raw counts are never reported as people: views are distinct
// viewer identities per share, actives are distinct identities per period.
// ─────────────────────────────────────────────────────────────────────────────

import { D7_WINDOW, G1_GATES, G1_DEFINITIONS_VERSION, type AnalyticsEvent } from './analytics-contract'

export interface GrowthEventRow {
  event_type: string
  user_id: string | null
  anon_id: string | null
  session_id: string | null
  /** ISO timestamp (server `created_at`). */
  created_at: string
  metadata: Record<string, unknown> | null
}

export interface IdentityLink { anon_id: string; user_id: string }

/** The extension's post-install page (EXTENSION_WELCOME_PATH); a first_visit landing here is an install. */
export const EXTENSION_WELCOME_LANDING = '/extension/welcome'

export interface GrowthMetrics {
  definitionsVersion: number
  period: { from: string; to: string }
  identities: {
    /** Distinct resolved identities with ≥1 event of any kind. */
    seen: number
    /** Active: ≥1 `query` in the period. */
    active: number
    /** Activated: ≥1 `result_action` in the session of their first `query`. */
    activated: number
    signups: number
  }
  activationRate: number | null
  d7: { cohortSize: number; retained: number; rate: number | null; window: typeof D7_WINDOW }
  shares: {
    created: number
    /** Distinct sharer identities. */
    sharers: number
    /** Distinct (share, viewer) pairs. */
    uniqueViews: number
    rawViewEvents: number
    viewsPerShare: number | null
    /** share_created / active identities. */
    shareRate: number | null
    /** Distinct viewer identities that later queried. */
    viewersWhoQueried: number
    /** Distinct viewer identities that later signed up. */
    viewersWhoSignedUp: number
    viewerToQuery: number | null
    viewerToSignup: number | null
    /** New (share-attributed) active identities per active identity. */
    kFactor: number | null
    /** Shares created FROM a share (`parent_share_id` present) — the loop's second generation. */
    secondGeneration: number
    /** Distinct viewer identities that later created a share of their own. */
    viewersWhoShared: number
    viewerToShare: number | null
    /**
     * Multi-generation attribution, from the `share_created` chain in the
     * window: generation 1 = no parent, 2 = parent is a root share, and so
     * on. A parent created outside the window counts as generation 0 (the
     * child is then generation 1 — the number is a lower bound, never a guess).
     */
    byGeneration: Record<number, number>
    /** Deepest generation observed. 1 while nobody has re-shared. */
    maxGeneration: number
  }
  /** Where FIRST queries in the period came from — acquisition by channel, one row per source. */
  acquisition: {
    firstQueriesBySource: Record<string, number>
  }
  /**
   * Browser extension: install → first use, with NO telemetry in the extension.
   * A fresh install opens /extension/welcome once; a `first_visit` landing there
   * is a NEW-TO-TAPPY install (an existing user installing is not counted — the
   * acquisition question is about new people). `firstQueries` are first queries
   * attributed `browser_extension`; `installToFirstQuery` is the share of those
   * new installs that asked anything afterwards.
   */
  extension: {
    newInstallLandings: number
    firstQueries: number
    installToFirstQuery: number | null
  }
  actions: {
    total: number
    byType: Record<string, number>
    /** Identities with ≥1 result_action / active identities. */
    resultActionRate: number | null
    outboundBookingClicks: number
  }
  gates: {
    gate0: GateVerdict
    gate1: GateVerdict
    gate2: GateVerdict
  }
}

export type GateStatus = 'pass' | 'warn' | 'fail' | 'insufficient_sample'
export interface GateVerdict { status: GateStatus; value: number | null; sample: number; target: number; fail: number; onFail: string }

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null)

/** VN calendar day (YYYY-MM-DD) of an ISO timestamp. */
export function vnDayOf(iso: string): string {
  const t = Date.parse(iso)
  return new Date(Math.floor((t + 7 * 3600 * 1000) / 86_400_000) * 86_400_000).toISOString().slice(0, 10)
}

/** Build the anon → user resolver. Unlinked anon ids resolve to themselves. */
export function makeIdentityResolver(links: IdentityLink[]): (row: Pick<GrowthEventRow, 'user_id' | 'anon_id'>) => string | null {
  const map = new Map<string, string>()
  for (const l of links) if (!map.has(l.anon_id)) map.set(l.anon_id, l.user_id)
  return (row) => {
    if (row.user_id) return `u:${row.user_id}`
    if (row.anon_id) { const u = map.get(row.anon_id); return u ? `u:${u}` : `a:${row.anon_id}` }
    return null
  }
}

function verdict(value: number | null, sample: number, sampleMin: number, target: number, fail: number, onFail: string): GateVerdict {
  if (value === null || sample < sampleMin) return { status: 'insufficient_sample', value, sample, target, fail, onFail }
  const status: GateStatus = value >= target ? 'pass' : value < fail ? 'fail' : 'warn'
  return { status, value, sample, target, fail, onFail }
}

/**
 * Compute every G1 metric for a period from its event rows.
 *
 * `rows` must contain the G1 events for [from, to] AND enough history before
 * `from` for D7 (the caller fetches `from - 10 days`); rows outside the period
 * only feed cohort/retention lookups and never inflate period counts.
 */
export function computeGrowthMetrics(input: {
  rows: GrowthEventRow[]
  links: IdentityLink[]
  from: string
  to: string
  now?: Date
}): GrowthMetrics {
  const resolve = makeIdentityResolver(input.links)
  const fromDay = vnDayOf(input.from)
  const toDay = vnDayOf(input.to)
  const todayDay = vnDayOf((input.now ?? new Date()).toISOString())
  const inPeriod = (r: GrowthEventRow) => { const d = vnDayOf(r.created_at); return d >= fromDay && d <= toDay }

  type Ev = { id: string; type: AnalyticsEvent | string; day: string; session: string | null; meta: Record<string, unknown>; at: number }
  const events: Ev[] = []
  for (const r of input.rows) {
    const id = resolve(r)
    if (!id) continue
    events.push({ id, type: r.event_type, day: vnDayOf(r.created_at), session: r.session_id, meta: r.metadata ?? {}, at: Date.parse(r.created_at) })
  }
  events.sort((a, b) => a.at - b.at)

  // First query per identity (all history), and the session it happened in.
  const firstQuery = new Map<string, Ev>()
  for (const e of events) if (e.type === 'query' && !firstQuery.has(e.id)) firstQuery.set(e.id, e)

  const period = events.filter(e => { return e.day >= fromDay && e.day <= toDay })
  const seen = new Set(period.map(e => e.id))
  const active = new Set(period.filter(e => e.type === 'query').map(e => e.id))
  const signups = new Set(period.filter(e => e.type === 'signup').map(e => e.id))

  // Activated: a result_action in the FIRST-QUERY session, for identities whose first query is in the period.
  const activated = new Set<string>()
  for (const e of events) {
    if (e.type !== 'result_action') continue
    const fq = firstQuery.get(e.id)
    if (!fq || fq.day < fromDay || fq.day > toDay) continue
    if (fq.session && e.session === fq.session) activated.add(e.id)
    else if (!fq.session && e.day === fq.day) activated.add(e.id) // no session id: same VN day is the fallback
  }
  const firstQueryInPeriod = [...firstQuery.values()].filter(fq => fq.day >= fromDay && fq.day <= toDay)

  // D7: cohort = first query day in period AND the whole window has closed.
  const queryDaysById = new Map<string, Set<string>>()
  for (const e of events) if (e.type === 'query') { if (!queryDaysById.has(e.id)) queryDaysById.set(e.id, new Set()); queryDaysById.get(e.id)!.add(e.day) }
  let cohortSize = 0, retained = 0
  for (const fq of firstQueryInPeriod) {
    const lastWindowDay = addDays(fq.day, D7_WINDOW.toDay)
    if (lastWindowDay >= todayDay) continue // window not closed — not measurable yet
    cohortSize++
    const days = queryDaysById.get(fq.id)!
    for (let d = D7_WINDOW.fromDay; d <= D7_WINDOW.toDay; d++) if (days.has(addDays(fq.day, d))) { retained++; break }
  }

  // Shares.
  const created = period.filter(e => e.type === 'share_created')
  const sharers = new Set(created.map(e => e.id))
  const viewEvents = period.filter(e => e.type === 'share_viewed')
  const viewPairs = new Set(viewEvents.map(e => `${String(e.meta.share_id)}|${e.id}`))
  const viewerIds = new Set(viewEvents.map(e => e.id))
  const viewerFirstView = new Map<string, number>()
  for (const e of viewEvents) if (!viewerFirstView.has(e.id)) viewerFirstView.set(e.id, e.at)
  const viewersWhoQueried = new Set<string>()
  const viewersWhoSignedUp = new Set<string>()
  const viewersWhoShared = new Set<string>()
  for (const e of period) {
    const t0 = viewerFirstView.get(e.id)
    if (t0 === undefined || e.at < t0) continue
    if (e.type === 'query') viewersWhoQueried.add(e.id)
    if (e.type === 'signup') viewersWhoSignedUp.add(e.id)
    if (e.type === 'share_created') viewersWhoShared.add(e.id)
  }
  const secondGeneration = created.filter(e => typeof e.meta.parent_share_id === 'string').length
  // Generation depth: walk parent_share_id through the shares created in the window.
  // Cycles are impossible by construction (a parent must exist before its child), but
  // the walk tracks visited ids anyway — a metrics query must never hang or inflate
  // on bad data; a revisit ends the walk where it stands.
  const parentOf = new Map<string, string | null>()
  for (const e of created) if (typeof e.meta.share_id === 'string') parentOf.set(e.meta.share_id, typeof e.meta.parent_share_id === 'string' ? e.meta.parent_share_id : null)
  const generationOf = (id: string): number => {
    const seen = new Set<string>([id])
    let g = 1, cur = parentOf.get(id) ?? null
    while (cur && parentOf.has(cur) && !seen.has(cur)) { seen.add(cur); g++; cur = parentOf.get(cur) ?? null }
    // A parent outside the window is unknown depth: count one more generation and stop.
    if (cur && !parentOf.has(cur)) g++
    return g
  }
  const byGeneration: Record<number, number> = {}
  let maxGeneration = created.length ? 1 : 0
  for (const e of created) {
    if (typeof e.meta.share_id !== 'string') continue
    const g = generationOf(e.meta.share_id)
    byGeneration[g] = (byGeneration[g] ?? 0) + 1
    if (g > maxGeneration) maxGeneration = g
  }
  // Acquisition by channel: the source stamped on each identity's FIRST query in the period.
  const firstQueriesBySource: Record<string, number> = {}
  for (const fq of firstQueryInPeriod) { const src = String(fq.meta.source ?? 'direct'); firstQueriesBySource[src] = (firstQueriesBySource[src] ?? 0) + 1 }
  // Extension installs: first_visit landings on the welcome page (new-to-Tappy installs only).
  const installLanding = new Map<string, number>()
  for (const e of period) {
    if (e.type !== 'first_visit') continue
    const lp = typeof e.meta.landing_path === 'string' ? e.meta.landing_path : ''
    if (lp === EXTENSION_WELCOME_LANDING || lp.startsWith(`${EXTENSION_WELCOME_LANDING}/`)) if (!installLanding.has(e.id)) installLanding.set(e.id, e.at)
  }
  const installedThenQueried = new Set<string>()
  for (const e of events) { const t0 = installLanding.get(e.id); if (t0 !== undefined && e.type === 'query' && e.at >= t0) installedThenQueried.add(e.id) }
  // k-factor: new active identities whose FIRST query is share-attributed, per active identity in period.
  const shareAttributedNew = firstQueryInPeriod.filter(fq => typeof fq.meta.share_id === 'string' || fq.meta.source === 'share_out' || fq.meta.source === 'zalo_link').length

  // Actions.
  const actions = period.filter(e => e.type === 'result_action')
  const byType: Record<string, number> = {}
  for (const a of actions) { const t = String(a.meta.action_type ?? 'unknown'); byType[t] = (byType[t] ?? 0) + 1 }
  const actors = new Set(actions.map(a => a.id))

  const activationRate = ratio(activated.size, firstQueryInPeriod.length)
  const d7Rate = ratio(retained, cohortSize)
  const kFactor = ratio(shareAttributedNew, active.size)

  const g = G1_GATES
  return {
    definitionsVersion: G1_DEFINITIONS_VERSION,
    period: { from: input.from, to: input.to },
    identities: { seen: seen.size, active: active.size, activated: activated.size, signups: signups.size },
    activationRate,
    d7: { cohortSize, retained, rate: d7Rate, window: D7_WINDOW },
    shares: {
      created: created.length,
      sharers: sharers.size,
      uniqueViews: viewPairs.size,
      rawViewEvents: viewEvents.length,
      viewsPerShare: ratio(viewPairs.size, created.length),
      shareRate: ratio(created.length, active.size),
      viewersWhoQueried: viewersWhoQueried.size,
      viewersWhoSignedUp: viewersWhoSignedUp.size,
      viewerToQuery: ratio(viewersWhoQueried.size, viewerIds.size),
      viewerToSignup: ratio(viewersWhoSignedUp.size, viewerIds.size),
      kFactor,
      secondGeneration,
      viewersWhoShared: viewersWhoShared.size,
      viewerToShare: ratio(viewersWhoShared.size, viewerIds.size),
      byGeneration,
      maxGeneration,
    },
    acquisition: { firstQueriesBySource },
    extension: {
      newInstallLandings: installLanding.size,
      firstQueries: firstQueriesBySource.browser_extension ?? 0,
      installToFirstQuery: ratio(installedThenQueried.size, installLanding.size),
    },
    actions: {
      total: actions.length,
      byType,
      resultActionRate: ratio(actors.size, active.size),
      outboundBookingClicks: byType.outbound_booking ?? 0,
    },
    gates: {
      gate0: verdict(activationRate, firstQueryInPeriod.length, g.gate0_product_signal.sampleMin, g.gate0_product_signal.activationTarget, g.gate0_product_signal.activationFail, g.gate0_product_signal.onFail),
      gate1: verdict(d7Rate, cohortSize, g.gate1_retention.sampleMin, g.gate1_retention.d7Target, g.gate1_retention.d7Fail, g.gate1_retention.onFail),
      gate2: verdict(kFactor, active.size, g.gate0_product_signal.sampleMin, g.gate2_viral.kFactorTarget, g.gate2_viral.kFactorFail, g.gate2_viral.onFail),
    },
  }
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}
