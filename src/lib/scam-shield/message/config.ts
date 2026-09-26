// Scam Shield · message analysis — every tunable in one place, mirroring `../config.ts`.

/** Longest message accepted, in characters AFTER normalisation. A scam SMS is ~300; a pasted
 *  chat thread a few thousand. Anything beyond is truncated, not refused — the head of a long
 *  paste is usually the message, the tail is usually quoted history. */
export const MESSAGE_MAX_CHARS = 4_000

/** Screenshot upload ceiling (binary bytes). Same number the QR route enforces. */
export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024
export const SCREENSHOT_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const

/** OCR output is bounded independently: a screenshot of a wall of text must not become an
 *  unbounded prompt. Capped to the same ceiling as pasted text. */
export const OCR_MAX_CHARS = MESSAGE_MAX_CHARS

/** URLs sent through the deterministic engine per message. Each is a full provider fan-out, so the
 *  count is small; the REST are still listed as entities, just not checked. */
export const MAX_URLS_CHECKED = 3

/** A message that is only a link (plus at most this much other text) is answered by the URL
 *  engine alone — LEVEL 0, no model, no quota. Counted in letters, so punctuation and emoji
 *  around a pasted link do not promote it to a "message". */
export const URL_ONLY_MAX_PROSE_LETTERS = 12

/** Messages longer than this go to the stronger model even when the rules found nothing — long
 *  pastes are where the signal hides in the middle. */
export const TIER2_MIN_CHARS = 1_500

/** Rule score band that means "the rules could not decide" and merits the stronger model. */
export const TIER2_AMBIGUOUS_MIN = 20
export const TIER2_AMBIGUOUS_MAX = 55

// ── Fusion ──────────────────────────────────────────────────────────────────

/** The model's four levels, as points on the engine's 0–100 scale (before confidence scaling). */
export const AI_LEVEL_SCORE: Record<'safe' | 'suspicious' | 'high_risk' | 'critical', number> = {
  safe: 4,
  suspicious: 45,
  high_risk: 72,
  critical: 92,
}

/** How much the model's confidence scales its level score: `base × (MIN + (1 − MIN) × confidence)`.
 *  At 0.4, a hesitant "suspicious" (0.3) lands in LOW, a confident one (0.7) in MEDIUM. */
export const AI_CONFIDENCE_SCALE_MIN = 0.4

/** Minimum model confidence (0–1) for its verdict to impose a FLOOR on the fused level. Below
 *  this the verdict still contributes to the score, it just cannot force the outcome alone. */
export const AI_FLOOR_MIN_CONFIDENCE = { high_risk: 0.6, critical: 0.7 }

/** Score floors per level — the lowest score inside each band of `LEVEL_THRESHOLDS`. */
export const LEVEL_FLOOR_SCORE = { MEDIUM: 31, HIGH: 60, CRITICAL: 85 } as const

/** The most the rules can score ON THEIR OWN — the top of the HIGH band. CRITICAL needs a second
 *  source (the model or a link finding) to agree; pattern matches alone do not earn the strongest
 *  word the product has. */
export const RULES_SOLO_MAX_SCORE = 80

/** Confidence budget (sums to 100). AI carries most of it because it is the only component that
 *  can look at meaning; rules always complete and get a fixed share; URL checks contribute
 *  according to how much of their own evidence base responded. */
export const CONFIDENCE_SHARE = { ai: 60, rules: 15, urls: 25 } as const

/** Bonus when two independent sources agree the message is dangerous. */
export const CORROBORATION_BONUS = 10

// ── Output bounds (model output is untrusted too) ───────────────────────────
export const MAX_SIGNALS = 12
export const MAX_REQUESTED_ACTIONS = 8
export const MAX_ENTITIES_PER_KIND = 10
export const MAX_EXPLANATION_CHARS = 280
export const MAX_SUMMARY_CHARS = 600
export const MAX_ENTITY_CHARS = 80
