// R22 (Android proposal 29/09, accepted by web): the plan-card image manifest — KEY → { status, url | replacement }.
// Adding an image = adding its key to IMAGE_KEYS and its file to public/plan-images/v1/<key>.webp (https URL only on the wire);
// retiring one = status "replaced" with its replacement key (clients follow at most 3 steps). A key with no entry shows the
// per-area placeholder on every client. The base URL is the site that serves the files: production by default, the UAT host in
// the Preview build via PLAN_IMAGE_BASE_URL. Bump IMAGE_VERSION when a picture changes (the file URL carries it as ?v=, so
// apps with the old picture cached fetch the new one).
export type PlanImageEntry = { status: 'active'; url: string } | { status: 'replaced'; replacement: string }

const BASE = (process.env.PLAN_IMAGE_BASE_URL || 'https://www.tappyai.com').replace(/\/+$/, '')
const IMAGE_VERSION = 1
/** Ask-card tiles ("what kind" step): the keys askCardModel.ts hands out; 640 px square WebP. */
export const IMAGE_KEYS: readonly string[] = [
  'diem-bar-rooftop',
  'diem-bida',
  'diem-bien',
  'diem-cafe',
  'diem-karaoke',
  'diem-lau-nuong',
  'diem-mua-sam',
  'diem-nail',
  'diem-nui',
  'diem-quan-an',
  'diem-rap-phim',
  'diem-spa'
]
const images: Record<string, PlanImageEntry> = {}
for (const k of IMAGE_KEYS) images[k] = { status: 'active', url: `${BASE}/plan-images/v1/${k}.webp?v=${IMAGE_VERSION}` }
export const PLAN_IMAGE_MANIFEST: { version: string; images: Record<string, PlanImageEntry> } = { version: `2026-10-02.${IMAGE_VERSION}`, images }
