// ── Capability Registry ──────────────────────────────────────────────────────
// Each provider declares which capabilities it supports so the Router (see
// router.ts) can select — or skip — a provider deterministically instead of
// failing mid-call. Adding a capability here is additive: an adapter that
// doesn't declare it is simply never treated as eligible for it.

export interface ProviderCapabilities {
  /** Can stream token deltas (AI SDK streamText). */
  streaming: boolean
  /** Can call zod-defined tools (AI SDK function/tool calling). */
  tools: boolean
  /** Can be forced to call a specific tool via experimental_prepareStep's toolChoice. */
  forcedToolChoice: boolean
  /** Accepts image parts in a message (vision/OCR). */
  vision: boolean
  /** Can be prompted for reliable structured/JSON output. */
  jsonMode: boolean
  /** Supports vendor-side prompt caching (e.g. Anthropic's cacheControl). */
  promptCaching: boolean
}

export type CapabilityKey = keyof ProviderCapabilities

export function hasCapabilities(caps: ProviderCapabilities, required: CapabilityKey[]): boolean {
  return required.every(k => caps[k])
}
