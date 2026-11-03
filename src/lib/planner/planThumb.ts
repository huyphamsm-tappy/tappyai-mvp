// ── Planner card thumbnail: reusable default + a user-chosen picture (Phase 7 closeout 8F/8G) ─────────────────────────────────
//
// A plan is derived from its conversation (derivePlans) — nothing about it is stored server-side. The user's choice of picture is
// therefore kept on the device (localStorage, per plan id: "persistence where supported"), and only from a fixed set of the
// product's own images — never an arbitrary URL. Order: the user's choice → a real photo of one of the plan's stops → the default.

export const PLAN_THUMB_DEFAULT = '/planner/plan-default.webp'
export const PLAN_THUMB_PRESETS: readonly string[] = [
  PLAN_THUMB_DEFAULT,
  '/home/inspire/travel.webp',
  '/home/inspire/travel-2.webp',
  '/home/inspire/food.webp',
  '/home/inspire/entertainment.webp',
  '/home/inspire/spa.webp',
  '/home/inspire/shopping.webp',
]

const key = (planId: string) => `tappy.planThumb.${planId}`

/** The stored choice, if it is still one of the presets (a stale or tampered value is ignored). */
export function readPlanThumb(planId: string, storage: Pick<Storage, 'getItem'> | null = typeof window !== 'undefined' ? window.localStorage : null): string | null {
  try {
    const v = storage?.getItem(key(planId)) ?? null
    return v && PLAN_THUMB_PRESETS.includes(v) ? v : null
  } catch { return null }
}

/** Saves a preset choice; false when storage is unavailable or the value is not a preset. */
export function writePlanThumb(planId: string, src: string, storage: Pick<Storage, 'setItem'> | null = typeof window !== 'undefined' ? window.localStorage : null): boolean {
  if (!PLAN_THUMB_PRESETS.includes(src)) return false
  try { storage?.setItem(key(planId), src); return !!storage } catch { return false }
}

export function resolvePlanThumb(o: { chosen: string | null; coverUrl: string | null | undefined }): string {
  return o.chosen ?? (o.coverUrl || PLAN_THUMB_DEFAULT)
}
