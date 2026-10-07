// ── Is this URL a direct destination, or a front door? ───────────────────────
//
// 🚨 A HOMEPAGE IS NOT EVIDENCE ABOUT ONE ENTITY, AND NEITHER IS A SEARCH PAGE.
// Measured on the cinema turn 2026-09-09: the retrieved links were
// `https://www.galaxycine.vn/` and `https://cinestar.com.vn/` — chain front
// doors — next to `https://www.cgv.vn/default/cinox/site/cgv-vincom-dong-khoi/`,
// which really is that cinema's own page. Only the third is entity-level.
//
// 🔑 ONE DEFINITION, TWO CONSUMERS. The prose guard uses it to decide whether a
// ticket claim has evidence; the CTA validator uses it to decide whether a
// button may promise a purchase. They must agree, so it lives here rather than
// being written twice — the same reason `placeAttribution` was extracted.
//
// Host-agnostic on purpose: an allowlist of "real" ticket vendors would be a
// second, weaker provenance rule that drifts the moment a vendor is missing.

/** A path beyond "/" that is not a search page. */
export function isDirectEntityUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    if (u.pathname.replace(/\/+$/, '').length <= 1) return false
    // A search page names no single entity, however deep its path.
    if (/(?:^|[?&])(?:q|query|search|keyword|s)=/.test(u.search)) return false
    if (/\/(?:search|tim-kiem|tim_kiem|results?)\b/i.test(u.pathname)) return false
    return true
  } catch { return false }
}
