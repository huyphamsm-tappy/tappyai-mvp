// A Free turn has NO tools (owner 14/11: the model's own ability only: no search, no realtime lookup, no partner links). One exception, by the owner's reason for it (20/11: a person who does not
// know how to use Tappy is the one who most needs to be told): explain_feature, which reads Tappy's own guide, calls no provider and costs nothing.
// Second exception (owner 28/11/2026): free_lookup, ONE light lookup (names and addresses of places, or a short list of web results with sources), capped per person per day
// (lib/ai/tools/freeLookup.ts). Nothing else passes.
export const FREE_TOOL_NAMES: readonly string[] = ['explain_feature', 'free_lookup']

/** The tools a Free turn may keep (an object with only the allowed names; empty when none of them is present). Pure; the input is not changed. */
export function toolsForFreePlan<T extends Record<string, unknown>>(tools: T): Partial<T> {
  const out: Partial<T> = {}
  for (const name of FREE_TOOL_NAMES) if (name in tools) (out as Record<string, unknown>)[name] = tools[name]
  return out
}
