// All configurable values for the Learning Engine.
// Change here to affect weights, decay, and scoring across the entire pipeline.

// Signal collection window (days). Events older than this are not fetched.
export const SIGNAL_WINDOW_DAYS = 90

// Points awarded per event type (before time decay).
export const WEIGHTS = {
  view: 1,           // Watched a review for ≥3 seconds
  watch_complete: 2, // Watched a review to ≥80% completion
  like: 3,
  save: 6,
  share: 8,
  follow: 10,
  write_review: 12,
  search: 2,
} as const

export type EventType = keyof typeof WEIGHTS

// Time decay buckets applied to weighted points. Evaluated in order.
export interface DecayBucket {
  maxDays: number
  factor: number
}

export const DECAY: DecayBucket[] = [
  { maxDays: 30, factor: 1.0 },
  { maxDays: 60, factor: 0.7 },
  { maxDays: 90, factor: 0.4 },
  { maxDays: Infinity, factor: 0.2 },
]

// Benchmark for a highly active user over SIGNAL_WINDOW_DAYS.
// confidence = totalWeightedPoints / MAX_EXPECTED_POINTS, clamped 0–1.
// ~20 views×1 + ~10 completions×2 + ~15 likes×3 + ~5 saves×6 + ~2 follows×10 + ~5 searches×2 + ~1 review×12 = 157
export const MAX_EXPECTED_POINTS = 200

// Keywords used to classify hashtags as food-related.
// Case-insensitive substring match.
export const FOOD_KEYWORDS: readonly string[] = [
  'food', 'cafe', 'coffee', 'restaurant',
  'ăn', 'uống', 'quán', 'nhà hàng',
  'bún', 'phở', 'cơm', 'bánh', 'chè', 'kem',
]

// Window for "recent interests" display (searches). Shorter than signal window.
export const RECENT_INTEREST_DAYS = 30

// Affinity propagation weights: how much a tag's score bleeds into its ancestors.
// DIRECT = tag itself, PARENT = one level up, GRANDPARENT = two levels, ROOT = three+.
export const AFFINITY_PROPAGATION = {
  DIRECT: 1.0,
  PARENT: 0.8,
  GRANDPARENT: 0.5,
  ROOT: 0.3,
} as const

// Points deducted per negative interaction (propagated up the taxonomy the same way).
// Deductions clamp at 0 — scores never go negative.
export const NEGATIVE_WEIGHTS = {
  hide: 2,
  not_interested: 3,
  report: 5,
} as const

export type NegativeEventType = keyof typeof NEGATIVE_WEIGHTS

export interface NegativeSignal {
  type: NegativeEventType
  tags: string[] // hashtags on the hidden/reported content
}
