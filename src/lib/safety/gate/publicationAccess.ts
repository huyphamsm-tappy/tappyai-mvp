/**
 * Server-side access control for the publication gate.
 *
 * ============================================================================
 * ONE RULE, ENFORCED IN ONE PLACE
 * ============================================================================
 * Content is publicly readable only when its `publication_state` is `PUBLISHED`
 * or NULL. NULL means the row predates the gate; treating it as published is
 * what makes the migration change nobody's visibility.
 *
 * `UNDER_REVIEW` and `RESTRICTED` are never public — on any surface, through any
 * route, by any id. UI hiding is not access control, so nothing here relies on
 * a client behaving.
 *
 * ============================================================================
 * WHAT IT IS NOT
 * ============================================================================
 * Not a ranking penalty, not a recommendation penalty, not a shadow ban. A row
 * that is not publishable is excluded from public reads entirely; a row that is
 * publishable is ranked exactly as it was before this file existed. There is no
 * third behaviour and no scoring input here.
 */

/** Lifecycle values the database may hold. `null` = predates the gate. */
export type StoredPublicationState = 'UNDER_REVIEW' | 'PUBLISHED' | 'RESTRICTED' | null | undefined;

/**
 * The PostgREST filter for "publicly readable".
 *
 * Mirrors the shape the codebase already uses for `is_hidden`, so the legacy
 * (NULL) case is handled the same way it always has been.
 */
export const PUBLISHABLE_FILTER = 'publication_state.is.null,publication_state.eq.PUBLISHED' as const;

/**
 * A filter that is inert until the lifecycle column exists.
 *
 * 🚨 DEPLOY-ORDER SAFETY. PostgREST errors on a filter that names a column the
 * table does not have, so shipping the real filter before the migration is
 * applied would break every feed query — the gate would take the product down
 * while being switched off. This returns a tautology in that window instead.
 *
 * `id.not.is.null` is true for every row (`id` is the primary key), so it filters
 * nothing and costs nothing, and the query keeps its existing shape rather than
 * needing a conditional branch at each call site.
 *
 * Once `CONTENT_SAFETY_SCHEMA_MIGRATED=true` the real filter applies. The two
 * switches are separate precisely so the migration and the gate can be turned on
 * in either order without a broken window between them.
 */
export function publishableFilter(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return env.CONTENT_SAFETY_SCHEMA_MIGRATED === 'true'
    ? PUBLISHABLE_FILTER
    : 'id.not.is.null';
}

/**
 * Is this row publicly readable?
 *
 * 🚨 Written as an allow-list on purpose. An unrecognised value — a typo, a
 * state added later, a column read from an older row shape — falls through to
 * `false`. An unknown lifecycle must never resolve to public.
 */
export function isPubliclyReadable(state: StoredPublicationState): boolean {
  if (state === null || state === undefined) return true; // predates the gate
  return state === 'PUBLISHED';
}

/** Filter a fetched page down to what may be shown to the public. */
export function publiclyReadableOnly<T extends { publication_state?: StoredPublicationState }>(
  rows: readonly T[],
): T[] {
  return rows.filter((r) => isPubliclyReadable(r.publication_state));
}

// ---------------------------------------------------------------------------
// Client bypass
// ---------------------------------------------------------------------------

/**
 * Fields a client may never set. Publication is decided by the server from an
 * evaluation, never accepted from a request body.
 */
export const SERVER_CONTROLLED_FIELDS: readonly string[] = Object.freeze([
  'publication_state',
  'safety_state',
  'evaluated_version',
  'evaluated_at',
  'is_hidden',
]);

/**
 * Strip server-controlled fields from anything a client sent.
 *
 * Returns the cleaned object and the names that were removed, so a forged
 * request can be refused loudly rather than quietly sanitised — a client that
 * tries this is not making a mistake.
 */
export function stripServerControlledFields<T extends Record<string, unknown>>(
  input: T,
): { readonly cleaned: Partial<T>; readonly rejected: readonly string[] } {
  const cleaned: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (SERVER_CONTROLLED_FIELDS.includes(key)) rejected.push(key);
    else cleaned[key] = value;
  }
  return { cleaned: cleaned as Partial<T>, rejected };
}

/** True when a request body attempts to set any server-controlled field. */
export function attemptsPublicationBypass(input: Record<string, unknown>): boolean {
  return SERVER_CONTROLLED_FIELDS.some((f) => f in input);
}

// ---------------------------------------------------------------------------
// Staleness at the row level
// ---------------------------------------------------------------------------

export interface StoredSafetyDecision {
  readonly publication_state?: StoredPublicationState;
  readonly evaluated_version?: string | null;
}

/**
 * The publication state a row is entitled to right now.
 *
 * 🔑 A decision made against a different fingerprint does not carry over. An
 * edit therefore returns the row to `UNDER_REVIEW` without anyone having to
 * remember to do it, which is the mechanism behind "V1 never authorises V2".
 *
 * A legacy row (no decision, no fingerprint) keeps its legacy treatment — the
 * gate does not retroactively seize content it never evaluated.
 */
export function effectivePublicationState(
  row: StoredSafetyDecision,
  currentVersion: string,
): 'UNDER_REVIEW' | 'PUBLISHED' | 'RESTRICTED' | 'LEGACY' {
  const stored = row.publication_state ?? null;
  if (stored === null && (row.evaluated_version ?? null) === null) return 'LEGACY';
  if ((row.evaluated_version ?? null) !== currentVersion) return 'UNDER_REVIEW';
  return stored === 'PUBLISHED' || stored === 'RESTRICTED' ? stored : 'UNDER_REVIEW';
}
