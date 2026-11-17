// The platform's own validated links of a turn (booking, event, film, product, coach/train), kept per tool.
//
// 03/11 (the owner's real conversation, turn 12): a model that searched fares for one date and then for another left the FIRST search's buttons
// under an answer that named the second date. A link built for a date is wrong for any other date, so for the tools whose links carry a date the
// latest call of the turn replaces what the earlier calls of the same tool added (even when the later call produced no link at all). Every other
// tool keeps all its links: two product searches are two products. Pure.

/** Tools whose links are built for one date: a later call of the same tool supersedes the earlier one's links. */
export const DATED_LINK_TOOLS: ReadonlySet<string> = new Set(['get_flight_prices', 'get_transport_options'])

export interface SystemLink { name: string; url: string }

export function createSystemLinkLedger() {
  const byTool = new Map<string, SystemLink[]>()
  const asks = new Map<string, string>()
  const order: string[] = []
  return {
    /**
     * One tool result: `links` are the validated links it carried (possibly none). `ask` = the route and day the call asked for. A dated tool's later call replaces the earlier one's links, EXCEPT a
     * later call for the very same ask that carried none (16/11, UAT 60: the model asked twice for Sài Gòn → Vũng Tàu on the same day, the second call found no link, and the first one's was wiped,
     * so the answer had no booking button): the same ask has the same dated link, so what was found is kept.
     */
    record(tool: string, links: readonly SystemLink[], ask?: string): void {
      if (DATED_LINK_TOOLS.has(tool)) {
        const repeatWithoutLink = links.length === 0 && !!ask && asks.get(tool) === ask && (byTool.get(tool)?.length ?? 0) > 0
        if (!repeatWithoutLink) byTool.delete(tool)
        if (ask) asks.set(tool, ask)
      }
      const kept = byTool.get(tool) ?? []
      for (const l of links) kept.push({ name: l.name, url: l.url })
      byTool.set(tool, kept)
      if (!order.includes(tool)) order.push(tool)
    },
    /** All current links, in the order their tools first produced results, each url once. */
    links(): SystemLink[] {
      const seen = new Set<string>()
      const out: SystemLink[] = []
      for (const t of order) for (const l of byTool.get(t) ?? []) if (!seen.has(l.url)) { seen.add(l.url); out.push(l) }
      return out
    },
  }
}
