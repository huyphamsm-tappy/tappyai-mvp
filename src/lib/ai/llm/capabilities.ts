// ── Capability Registry ──────────────────────────────────────────────────────
// Each provider declares which capabilities it supports so the Router (see
// router.ts) can validate a provider deterministically before use. Adding a
// capability here is additive: an adapter that doesn't declare it is simply
// never treated as eligible for it.
//
// Sprint 3 hardening: a provider missing a required capability is a hard
// failure (UnsupportedCapabilityError), never a silent downgrade or an
// auto-switch to a different provider — see ADR-010.

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

// Canonical, exhaustive list of every capability key. Kept as an explicit
// runtime array (rather than derived from the type, which TS erases) so
// config validation (configValidation.ts) can check for duplicates/typos and
// so a provider's own declared capabilities object can be checked for unknown
// or missing keys. golden.test.ts asserts this list stays in sync with the
// Claude adapter's declared keys, so it can't silently drift from the type.
export const ALL_CAPABILITY_KEYS: CapabilityKey[] = [
  'streaming',
  'tools',
  'forcedToolChoice',
  'vision',
  'jsonMode',
  'promptCaching',
]

/** Non-throwing predicate — true only if every required capability is present. */
export function hasCapabilities(caps: ProviderCapabilities, required: CapabilityKey[]): boolean {
  return required.every(k => caps[k])
}

export class UnsupportedCapabilityError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly role: string,
    public readonly missing: CapabilityKey[],
  ) {
    super(
      `[ai] Provider "${providerId}" does not support required capability/capabilities ` +
      `[${missing.join(', ')}] for role "${role}".`,
    )
    this.name = 'UnsupportedCapabilityError'
  }
}

/**
 * Throws UnsupportedCapabilityError listing every missing capability if the
 * provider can't serve all of `required`. Never downgrades or picks a
 * different capability set — the caller either gets exactly what it asked
 * for, or a clear, typed failure.
 */
export function assertCapabilities(
  providerId: string,
  role: string,
  caps: ProviderCapabilities,
  required: CapabilityKey[],
): void {
  const missing = required.filter(k => !caps[k])
  if (missing.length > 0) throw new UnsupportedCapabilityError(providerId, role, missing)
}
