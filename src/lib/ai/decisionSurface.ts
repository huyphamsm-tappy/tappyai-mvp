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
