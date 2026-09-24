// ─────────────────────────────────────────────────────────────────────────────
// G1 growth report — the data-access half of the gate report.
//
// Reads the seven canonical events for a bounded window (plus the D7
// look-back) and the identity stitch map, then hands both to the PURE
// `computeGrowthMetrics`. No SQL aggregation: the definitions live in one
// place, and the same numbers can be reproduced from an event export.
//
// BOUNDED ON PURPOSE. Gate 1 needs n ≥ 300 identities, not millions of rows;
// the window is capped at 90 days and the read at MAX_ROWS so a report can
// never become an unbounded scan. If G1 volume ever outgrows this, the right
// move is a daily rollup that stores `computeGrowthMetrics` output — not a
// bigger query here.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { ANALYTICS_EVENTS, D7_WINDOW } from './analytics-contract'
import { computeGrowthMetrics, type GrowthEventRow, type GrowthMetrics, type IdentityLink } from './growthMetrics'

export const GROWTH_REPORT_MAX_DAYS = 90
export const GROWTH_REPORT_MAX_ROWS = 200_000
const PAGE = 1000

export interface GrowthReportRange { from: string; to: string }

/** Pure: default window = last 30 VN days ending today. Clamped to the cap. */
export function resolveRange(q: { from?: string; to?: string }, today: string): GrowthReportRange {
  const to = q.to ?? today
  const from = q.from ?? shiftDay(to, -29)
  const spanDays = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
  return spanDays > GROWTH_REPORT_MAX_DAYS ? { from: shiftDay(to, -(GROWTH_REPORT_MAX_DAYS - 1)), to } : { from, to }
}

function shiftDay(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

/** VN day boundaries as UTC instants. */
function vnDayStartUtc(day: string): string { return new Date(Date.parse(`${day}T00:00:00Z`) - 7 * 3600 * 1000).toISOString() }
function vnDayEndUtc(day: string): string { return new Date(Date.parse(`${day}T00:00:00Z`) + 17 * 3600 * 1000 - 1).toISOString() }

export async function loadGrowthReport(supabase: SupabaseClient, range: GrowthReportRange, now: Date = new Date()): Promise<GrowthMetrics & { truncated: boolean }> {
  const lookbackFrom = vnDayStartUtc(shiftDay(range.from, -(D7_WINDOW.toDay + 1)))
  const to = vnDayEndUtc(range.to)

  const rows: GrowthEventRow[] = []
  let truncated = false
  for (let offset = 0; rows.length < GROWTH_REPORT_MAX_ROWS; offset += PAGE) {
    const { data, error } = await supabase
      .from('user_events')
      .select('event_type, user_id, anon_id, session_id, created_at, metadata')
      .in('event_type', [...ANALYTICS_EVENTS])
      .gte('created_at', lookbackFrom)
      .lte('created_at', to)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(`growth report read failed: ${error.code}`)
    if (!data?.length) break
    rows.push(...(data as GrowthEventRow[]))
    if (data.length < PAGE) break
    if (rows.length >= GROWTH_REPORT_MAX_ROWS) truncated = true
  }

  const anonIds = [...new Set(rows.map(r => r.anon_id).filter((x): x is string => !!x))]
  const links: IdentityLink[] = []
  for (let i = 0; i < anonIds.length; i += PAGE) {
    const { data, error } = await supabase.from('anon_identity_map').select('anon_id, user_id').in('anon_id', anonIds.slice(i, i + PAGE))
    if (error) throw new Error(`growth report stitch read failed: ${error.code}`)
    links.push(...((data ?? []) as IdentityLink[]))
  }

  const metrics = computeGrowthMetrics({ rows, links, from: vnDayStartUtc(range.from), to, now })
  return { ...metrics, period: { from: range.from, to: range.to }, truncated }
}
