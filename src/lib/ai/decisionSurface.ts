/**
 * Which clients render the decision card.
 *
 * `/api/chat` reads the `x-tappy-surface` request header to learn whether the
 * client will draw the place/shopping decision as a card under the reply. The
 * answer changes two things about the reply, and nothing else:
 *
 *  - the model is told the card shows photo / rating / address / hours / actions,
 *    so the prose must not repeat them (`buildRenderedDecisionBlock`), and
 *  - the stream filter does not inject the per-place photo + provider-link block
 *    into the text (`streamEnrichment`), because the card carries the same three
 *    things and the duplicated Food answer was the bug.
 *
 * The web chat (`ChatInterface.tsx`) sends `web`; the Android app
 * (`RealChatRepository.kt`) sends `android` and renders `PlaceDecisionSection` /
 * the shopping decision card from the same `8:` annotation. Measured on Pixel_8
 * 2026-09-12 before Android identified itself: the same query returned the same
 * annotation, but the prose carried three injected images and three provider
 * rows and the card started on the third screen.
 *
 * A request with no header, or an unknown surface (iOS, an older build, a
 * script), keeps the injected block — there it is the only channel for those
 * links.
 */
export const DECISION_CARD_SURFACES: ReadonlySet<string> = new Set(['web', 'android'])

export function rendersDecisionCard(surface: string | null | undefined): boolean {
  return surface != null && DECISION_CARD_SURFACES.has(surface)
}

/**
 * Consult V2 (owner 2026-09-29): surfaces that render the structured ASK block ([TAPPY_ASK] with one
 * chip group per question). Only web today; Android / iOS get the same questions as readable lines +
 * the first question's chips until their parsers ship (docs/uat/ANDROID-REQUESTS.md) — an older build
 * would otherwise show the JSON.
 */
export const ASK_BLOCK_SURFACES: ReadonlySet<string> = new Set(['web'])

/**
 * R10 (Android 29/09): a client that can parse the block says so in `x-tappy-caps` (comma/space list,
 * e.g. "ask"). Gating on the CAPABILITY, not the surface, keeps older Android builds — which still send
 * `x-tappy-surface: android` but have no parser — on the readable lines.
 */
export function clientCaps(header: string | null | undefined): Set<string> {
  return new Set(String(header ?? '').toLowerCase().split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))
}

export function rendersAskBlock(surface: string | null | undefined, caps?: string | null): boolean {
  if (clientCaps(caps).has('ask')) return true
  return surface != null && ASK_BLOCK_SURFACES.has(surface)
}
