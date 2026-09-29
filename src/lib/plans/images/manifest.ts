// R22 (Android proposal 29/09, accepted by web): the plan-card image manifest — KEY → { status, url | replacement }.
// No image library is published yet, so the map is EMPTY: every key resolves to the per-area placeholder on every
// client, which is the agreed behaviour until images are uploaded. Adding an image = adding an entry here (https URL
// only); retiring one = status "replaced" with its replacement key (clients follow at most 3 steps).
export type PlanImageEntry = { status: 'active'; url: string } | { status: 'replaced'; replacement: string }
export const PLAN_IMAGE_MANIFEST: { version: string; images: Record<string, PlanImageEntry> } = { version: '2026-09-30.0', images: {} }
