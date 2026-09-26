import { createClient } from '@/lib/supabase/server'
import { PLAN_SHARE_ID_RE, brochureOf, readPlanShareSnapshot, type PlanBrochure } from '@/lib/plans/share/planShare'

/**
 * The published plan behind a share id, or null.
 *
 * Reads through `plan_share_public` — the SECURITY DEFINER function that is
 * the ONLY way a recipient reaches a snapshot. It answers with three public
 * columns for one exact id; there is no listing and no owner. The request's
 * own client is used (anon for a signed-out recipient), never a service key:
 * the function's grant is the authority and this page adds nothing to it.
 *
 * The id is checked against the wire format before any query, so a malformed
 * segment is a 404 that cost nothing. The row is re-validated by
 * `readPlanShareSnapshot` on the way out: the database is not the type system.
 *
 * Lives beside the page rather than in it because Next allows a page to export
 * only its reserved names, and this read is worth testing on its own.
 */
export async function getPlanShare(shareId: string): Promise<PlanBrochure | null> {
  if (!PLAN_SHARE_ID_RE.test(shareId)) return null
  const supabase = createClient()
  const { data, error } = await supabase.rpc('plan_share_public', { p_id: shareId })
  if (error || !Array.isArray(data) || data.length === 0) return null
  const snapshot = readPlanShareSnapshot((data[0] as { plan?: unknown }).plan)
  return snapshot ? brochureOf(snapshot) : null
}
