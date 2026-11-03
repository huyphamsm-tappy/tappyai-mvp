// ── Gate 2 S5, D-S5-4 (PROPOSAL): general search engines the server may link to, as registry data ─────────────────────────────────
//
// Google Shopping was written inline in directionsAppendix.ts. It is NOT a marketplace: adding it to marketplaceSearchTemplates()
// would change the prompt's CTA buttons, the search_products links and the CTA host prefixes (S5-ADDENDUM.md F4). So it is a list of
// its own, used only by the server-built product-search appendix and by the server-built link host check (urlGrants.ts).
// It lives OUTSIDE ccp/adapters/ on purpose (S5-DECISIONS-2 A1): ccpBoundary.test.ts holds every host under adapters/ to the merchant
// registry, and Google is not a merchant.

export function searchEngineTemplates(): Array<{ providerId: string; name: string; template: string }> {
  return [{ providerId: 'google_shopping', name: 'Google Mua sắm', template: 'https://www.google.com/search?tbm=shop&q={q}' }]
}
