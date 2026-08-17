/**
 * Explore feed → P1 observation.
 *
 * The adapter between a `reviews` row as the feed selects it and the generic
 * observation seam. It is the ONLY thing the feed route imports from the policy
 * module, so the production surface of this module is one function.
 *
 * ============================================================================
 * WHAT IT DOES, AND THE THREE THINGS IT CANNOT DO
 * ============================================================================
 * It classifies. It cannot act: the returned `ObservationRecord[]` has no field
 * for visibility, ranking, ordering, recommendation or notification, and there
 * is no branch here in which to add one. It cannot leak: the record carries an
 * id, a fingerprint, a policy ref, a state and a timestamp — no body, no
 * caption, no media URL, no author. It cannot fail loudly: every entry point is
 * total, so a detector problem degrades to "no observation", never to a broken
 * feed and never to a finding.
 *
 * 🚨 THERE IS NO SINK. Nothing in this repository can persist an
 * `ObservationRecord` from an edge route: `audit_log` is node-only and
 * actor-centric, `user_events` has no server-side writer, `event_outbox` is
 * deliberately unreachable from the app tier, and `reviews` has no
 * classification column. Where these records go — and how long they are kept —
 * is a Product and privacy decision that has not been made. Until it is, the
 * caller receives the records and discards them.
 *
 * ============================================================================
 * FROZEN CONTRACT (Owner, 2026-08-17)
 * ============================================================================
 * P1 semantics are frozen at the accepted 6/8 behaviour. Absent consent
 * evidence stays UNDETERMINED and never becomes a violation. In production that
 * means almost every row lands on `UNDETERMINED_EVIDENCE` today, because no
 * evidence source for consent exists — that is the accepted state of the world,
 * not a defect in this file.
 */

import { contentVersionFrom, type ContentRef } from './contentClassification';
import { evaluatePolicy } from '../engine/evaluator';
import {
  observeExploreContent,
  type ObservationRecord,
  type PolicyProbe,
} from './observation';
import {
  detectPrivacySignals,
  privacyPolicyRecord,
  privacyProbe,
  privacySubject,
} from '../detect/privacyPersonalInformation';

/**
 * The subset of a feed row this classification reads.
 *
 * 🔑 Only classified fields, plus the place fields that establish the §9.4
 * business-contact carve-out. Deliberately absent: `user_id` (identity must not
 * travel with a classification) and every engagement counter (they would make
 * the content fingerprint churn on each interaction).
 */
export interface ReviewRowForObservation {
  readonly id?: unknown;
  readonly body?: unknown;
  readonly hashtags?: unknown;
  readonly place_name?: unknown;
  readonly place_address?: unknown;
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string').join(' ');
  return '';
}

/**
 * The text P1 classifies, and the fingerprint that text belongs to.
 *
 * Both are derived from the SAME fields, so a classification can never outlive
 * an edit to the content it describes (Q3).
 */
function classifiedFieldsOf(row: ReviewRowForObservation): {
  readonly text: string;
  readonly version: string;
} {
  const body = asText(row.body);
  const hashtags = asText(row.hashtags);
  return {
    text: `${body} ${hashtags}`.trim(),
    version: contentVersionFrom({ body, hashtags }),
  };
}

/** Content reference for a row, or `null` when the row has no usable id. */
function contentRefOf(row: ReviewRowForObservation, version: string): ContentRef | null {
  return typeof row.id === 'string' && row.id.length > 0
    ? { contentId: row.id, contentVersion: version }
    : null;
}

/**
 * Classify one row against P1.
 *
 * Returns the observation lines, or an empty list when the row cannot be
 * observed. An empty list means "nothing was observed", which the seam keeps
 * distinct from "nothing could be observed" via its own `NO_DETECTOR` result.
 */
export function observePrivacyForReview(
  row: ReviewRowForObservation,
  evaluatedAt: string,
): readonly ObservationRecord[] {
  const { text, version } = classifiedFieldsOf(row);
  const content = contentRefOf(row, version);
  if (content === null) return [];

  const signals = detectPrivacySignals({
    text,
    businessContactStrings: [asText(row.place_name), asText(row.place_address)],
  });

  const result = observeExploreContent(
    { content, probes: [privacyProbe()], evaluatedAt },
    (probe: PolicyProbe, asOf: string) =>
      evaluatePolicy(privacyPolicyRecord(), {
        subject: privacySubject(signals),
        predicate: probe.predicate,
        asOf,
      }),
  );

  return result.observed ? result.records : [];
}

/**
 * Classify a page of feed rows.
 *
 * TOTAL BY CONSTRUCTION. A throw anywhere inside — a malformed row, a registry
 * problem, anything unforeseen — yields an empty list rather than propagating.
 * The feed must not be able to fail because a classifier did: this function is
 * observation, and an observation that cannot be made is simply absent.
 *
 * 🚨 The caller must not treat an empty result as "nothing found". It means
 * "nothing observed", which includes the case where observation itself failed.
 */
export function observePrivacyForFeed(
  rows: readonly ReviewRowForObservation[],
  evaluatedAt: string,
): readonly ObservationRecord[] {
  try {
    return rows.flatMap((row) => observePrivacyForReview(row, evaluatedAt));
  } catch {
    return [];
  }
}
