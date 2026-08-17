/**
 * Content-safety evidence — the types.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * The policy engine can express eighteen policies faithfully, and today it
 * answers `INSUFFICIENT_EVIDENCE` for all of them on real content — not because
 * the engine is wrong, but because nothing ever looked at the media. This module
 * is the layer that looks.
 *
 * ============================================================================
 * WHY IT LIVES OUTSIDE `src/lib/policy`
 * ============================================================================
 * The policy module is guarded to perform no network calls, no writes and no
 * scheduling, and a test scans its source to prove it. Acquiring evidence is
 * inherently impure — it fetches, it calls a model, it can fail. Keeping the two
 * apart is what lets the policy module stay provably inert while this one is
 * allowed to reach the outside world.
 *
 * ============================================================================
 * THE DISTINCTION EVERYTHING DEPENDS ON
 * ============================================================================
 * Three different things are kept apart, and collapsing any two of them is the
 * failure this file exists to prevent:
 *
 *   `OBSERVED`     the modality ran and reports what it saw — possibly nothing
 *   `UNAVAILABLE`  the modality does not exist in this product; nothing looked
 *   `FAILED`       the modality exists and broke
 *
 * "Looked and saw nothing" is evidence. "Never looked" is not, and must never be
 * read as a clean result. "Broke" is an engine error and is neither.
 */

/** How a single modality ended. Never collapsed into a boolean. */
export const MODALITY_STATUS = ['OBSERVED', 'UNAVAILABLE', 'FAILED'] as const;
export type ModalityStatus = (typeof MODALITY_STATUS)[number];

/** The modalities the pipeline has slots for. Slots exist before capability does. */
export const MODALITIES = [
  /** Caption, body and hashtags supplied with the post. */
  'TEXT',
  /** Structured facts the platform already holds about the item. */
  'METADATA',
  /** The poster frame of a video, or a photo — a real frame of the real media. */
  'IMAGE_FRAME',
  /** Sampling several frames across a video's duration. */
  'VIDEO_FRAMES',
  /** Speech in the audio track. */
  'AUDIO_SPEECH',
] as const;
export type Modality = (typeof MODALITIES)[number];

/**
 * Why a modality is unavailable. Recorded so "we cannot" never reads as "we did
 * and found nothing", and so the gap is enumerable rather than folklore.
 */
export interface ModalityUnavailable {
  readonly modality: Modality;
  readonly status: 'UNAVAILABLE';
  /** Plain statement of the missing capability. Never a guess about content. */
  readonly reason: string;
}

export interface ModalityFailed {
  readonly modality: Modality;
  readonly status: 'FAILED';
  /** Failure class only — never the payload, never the content, never a stack. */
  readonly reason: string;
}

/**
 * What a modality actually saw.
 *
 * 🚨 OBSERVATIONS, NOT VERDICTS. Nothing in here may be a policy conclusion. A
 * modality reports "a phone-shaped string appears in the frame"; it never
 * reports "this violates privacy". The mapping layer decides what an observation
 * is worth, and the corpus decides what the mapping is allowed to mean.
 */
export interface ModalityObserved {
  readonly modality: Modality;
  readonly status: 'OBSERVED';
  /**
   * Contact-shaped identifiers found, in normalised comparison form.
   * Digits and letters only — never the surrounding text.
   */
  readonly contactIdentifiers?: readonly string[];
  /**
   * Text the modality read out of the media itself (on-screen text, overlays).
   * Bounded and stored only long enough to extract identifiers from it.
   */
  readonly recognisedText?: string;
  /** Neutral, non-policy descriptors the modality is confident of. */
  readonly descriptors?: readonly string[];
}

export type ModalityResult = ModalityObserved | ModalityUnavailable | ModalityFailed;

/**
 * Everything gathered about one version of one item.
 *
 * 🔑 `contentVersion` is the fingerprint of the fields that were examined. It is
 * what stops evidence gathered for one version of a post from authorising the
 * publication of a later edit.
 */
export interface EvidenceBundle {
  readonly contentId: string;
  readonly contentVersion: string;
  /** ISO-8601, supplied by the caller. Nothing here reads a clock. */
  readonly gatheredAt: string;
  readonly results: readonly ModalityResult[];
}

// ---------------------------------------------------------------------------
// Reading a bundle
// ---------------------------------------------------------------------------

export function resultFor(bundle: EvidenceBundle, modality: Modality): ModalityResult | undefined {
  return bundle.results.find((r) => r.modality === modality);
}

export function observationsIn(bundle: EvidenceBundle): readonly ModalityObserved[] {
  return bundle.results.filter((r): r is ModalityObserved => r.status === 'OBSERVED');
}

/** True when any modality broke. An engine error is never a clean result. */
export function hasFailure(bundle: EvidenceBundle): boolean {
  return bundle.results.some((r) => r.status === 'FAILED');
}

/**
 * Every contact-shaped identifier any modality saw, deduplicated.
 *
 * 🔑 Union across modalities is safe here because identifiers are structural
 * facts, not judgements: a number burned into a video frame is as real as one
 * typed in the caption. Judgements are never unioned this way.
 */
export function allContactIdentifiers(bundle: EvidenceBundle): readonly string[] {
  const seen = new Set<string>();
  for (const observed of observationsIn(bundle)) {
    for (const id of observed.contactIdentifiers ?? []) seen.add(id);
  }
  return [...seen];
}

/**
 * Did anything actually look at the media itself?
 *
 * Text and metadata are supplied *with* the post; they are not the media. A
 * bundle carrying only those has not examined the content, and the gate must not
 * treat it as though it had.
 */
export const MEDIA_MODALITIES: readonly Modality[] = ['IMAGE_FRAME', 'VIDEO_FRAMES', 'AUDIO_SPEECH'];

export function mediaWasExamined(bundle: EvidenceBundle): boolean {
  return bundle.results.some((r) => MEDIA_MODALITIES.includes(r.modality) && r.status === 'OBSERVED');
}

/** Modalities that could not run, so the coverage gap is reportable, not implicit. */
export function coverageGaps(bundle: EvidenceBundle): readonly ModalityUnavailable[] {
  return bundle.results.filter((r): r is ModalityUnavailable => r.status === 'UNAVAILABLE');
}
