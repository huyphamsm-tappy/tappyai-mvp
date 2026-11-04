import { moderateImageWithOpenAI, type ModerationOutcome } from '@/lib/ai/llm/providers/openaiModeration'

/**
 * Safety scan of a chat picture BEFORE it is stored (owner approved 04/11/2026: "nếu OpenAI miễn phí thì làm").
 *
 * The provider call lives in the provider layer (src/lib/ai/llm/providers/openaiModeration.ts: the moderation endpoint accepts images and is free of charge). The picture is the
 * CLEAN one (already re-encoded without metadata), sent once; nothing is kept by us. Because the picture of a private conversation goes to a provider, the upload route first
 * requires the same AI-data consent as every other AI endpoint (aiConsentGuard).
 *
 * Verdicts:
 *  - 'ok'          the provider flagged none of the blocked categories.
 *  - 'blocked'     sexual content, sexual content involving minors, or graphic violence.
 *  - 'unavailable' the scan could not be completed (no key, timeout, HTTP error, unreadable answer). The route REFUSES the upload in this case: a state that cannot be
 *                  verified is not assumed to be safe (the same rule as the consent guard). Switching the scan off is explicit: CHAT_IMAGE_SCAN_ENABLED=false.
 *  - 'off'         switched off explicitly.
 */

export type ImageScanVerdict = 'ok' | 'blocked' | 'unavailable' | 'off'

export const BLOCKED_CATEGORIES = ['sexual', 'sexual/minors', 'violence/graphic'] as const

export function imageScanEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.CHAT_IMAGE_SCAN_ENABLED ?? '').trim().toLowerCase() !== 'false'
}

export interface ImageScanDeps {
  env?: Record<string, string | undefined>
  moderate?: (bytes: Uint8Array, mime: string) => Promise<ModerationOutcome>
}

export async function scanChatImage(bytes: Uint8Array, mime: string, deps: ImageScanDeps = {}): Promise<ImageScanVerdict> {
  if (!imageScanEnabled(deps.env ?? process.env)) return 'off'
  const out = await (deps.moderate ?? ((b, m) => moderateImageWithOpenAI(b, m)))(bytes, mime)
  if (out.status !== 'ok') {
    if (out.reason === 'no_key') console.error('[messaging/imageScan] the moderation key is missing: refusing pictures until the scan is available or switched off explicitly')
    return 'unavailable'
  }
  return BLOCKED_CATEGORIES.some((c) => out.categories[c] === true) ? 'blocked' : 'ok'
}
