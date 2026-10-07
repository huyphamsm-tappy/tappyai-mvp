// ─────────────────────────────────────────────────────────────────────────────
// QR / POS entry links — G1-H.
//
// A printed QR points at a PUBLIC Tappy entry and carries `?src=qr_pos`, the
// only thing the attribution layer reads from a query string. No partner
// integration, no per-venue tracking id, no new table: the source enum is the
// whole contract, and the QR is rendered by the dependency-free generator the
// profile QR already uses.
//
// Entry paths are an allow-list. A QR is a physical artefact that outlives any
// deployment, so it must only ever point at surfaces that are meant to be
// permanent public entries.
// ─────────────────────────────────────────────────────────────────────────────

import { absoluteUrl } from '@/lib/share/openGraph'
import { HUB_DOMAINS } from '@/lib/discovery/domainHubs'
import { SOURCE_PARAM } from '@/lib/analytics/attribution'
import { encodeQR, qrToSvg } from '@/lib/qr/qrcode'

export const QR_ENTRY_PATHS: readonly string[] = ['/', ...HUB_DOMAINS.map((d) => `/${d}`)]

export function isQrEntryPath(v: unknown): v is string {
  return typeof v === 'string' && QR_ENTRY_PATHS.includes(v)
}

/** The URL a QR encodes. Pure. */
export function buildQrEntryUrl(path: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!isQrEntryPath(path)) throw new Error('not a QR entry path')
  return `${absoluteUrl(path, env)}?${SOURCE_PARAM}=qr_pos`
}

/** The printable SVG for an entry path. Deterministic; no network. */
export function renderQrEntrySvg(path: string, size = 512, env: NodeJS.ProcessEnv = process.env): string {
  return qrToSvg(encodeQR(buildQrEntryUrl(path, env)), { size, margin: 4 })
}
