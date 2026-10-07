import { mergeRefs, verifiedRefsFor, type LocateFn } from './locations'
import type { RealtimeProviderId, SearchCriteria } from './types'

/**
 * The criteria with THIS provider's own ids filled in: the caller's refs, then the verified table, then (only for a provider that is READY
 * and has no id yet) the optional lookup port. Another provider's id is never copied across. A failing lookup is "unknown", never an error.
 */
export async function locateRefs(provider: RealtimeProviderId, criteria: SearchCriteria, locate?: LocateFn): Promise<SearchCriteria> {
  const ctx = criteria.context
  let refs = mergeRefs(ctx.providerRefs, verifiedRefsFor(ctx.destination))
  const own = refs?.[provider]
  if (!own?.cityRef && !own?.propertyRefs?.length && locate && ctx.destination) {
    try {
      const found = await locate(provider, ctx.destination)
      if (found && (found.cityRef || found.propertyRefs?.length)) refs = { ...(refs ?? {}), [provider]: { ...(own ?? {}), ...found } }
    } catch { /* an unknown location is a deeplink, not a failure */ }
  }
  return refs ? { ...criteria, context: { ...ctx, providerRefs: refs } } : criteria
}
