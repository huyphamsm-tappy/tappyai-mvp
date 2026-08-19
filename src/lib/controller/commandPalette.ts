// Controller V2 — Phase 7 / B5: the COMMAND PALETTE, navigation half.
//
// 01_ARCH §8 names the surface "⌘K Command Palette — navigate · act · search"
// and states the rule navigation obeys: "Derived from the Module Registry,
// filtered by the actor's permissions. You never see a door you cannot open."
//
// ONLY `navigate` is implemented, and only because that rule defines it. `act`
// and `search` are named and never specified — no source lists a command, its
// permission, its confirmation or its audit; none names a searchable entity,
// field, ranking or scope. Both are left unimplemented rather than invented; a
// palette that executes an admin mutation nobody specified is the worst possible
// place to guess.
//
// SECURITY: this module re-derives NOTHING. It transforms `NavGroup[]`, which
// the server already filtered through the PDP and the hub `permissionScope`.
// Filtering is a subset operation, so no query can surface a command the server
// did not authorize. There is no second authorization layer here, and there
// cannot be one — the input is the only source of truth about what exists.

import type { NavGroup } from './navigationProvider'

export interface Command {
  /** The nav item's module id. Internal — never matched against, never rendered. */
  moduleId: string
  route: string
  /** i18n key. The UI owns the locale; this module never resolves text. */
  labelKey: string
  /** i18n key of the owning hub, so a command can say where it leads. */
  hubLabelKey: string
  icon?: string
}

/**
 * Flatten the authorized navigation into a command list.
 *
 * Hub order then item order — exactly the order `deriveNavigation` already
 * chose. A second ordering rule here could disagree with the sidebar's, and then
 * the same registry state would render two different sequences.
 *
 * A route is emitted once. `deriveNavigation` already de-duplicates, but a
 * palette showing one destination twice reads as two different places.
 */
export function toCommands(groups: readonly NavGroup[]): Command[] {
  const commands: Command[] = []
  const seen = new Set<string>()

  for (const group of groups) {
    for (const item of group.items) {
      if (seen.has(item.route)) continue
      seen.add(item.route)
      commands.push({
        moduleId: item.moduleId,
        route: item.route,
        labelKey: item.label,
        hubLabelKey: group.label,
        icon: item.icon,
      })
    }
  }

  return commands
}

/**
 * Narrow the command list by what the operator typed.
 *
 * This is the palette's own filter over an already-authorized list — NOT the
 * `search` capability of §8, which would mean searching entities (users, deals,
 * audit rows) and has no defined scope, ranking, field set or permission rule
 * anywhere. Nothing here reaches data.
 *
 * Matching is on the TRANSLATED label and hub name only. Routes and module ids
 * are deliberately excluded: matching them would let an operator find a screen
 * by typing a path they were never shown, and would leak the internal id shape
 * into a text box.
 *
 * Order is preserved rather than ranked. No source defines a ranking, and an
 * invented one would silently decide what an operator sees first.
 */
export function filterCommands(
  commands: readonly Command[],
  query: string,
  label: (key: string) => string
): Command[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...commands]

  return commands.filter((c) => {
    const haystack = `${label(c.labelKey)} ${label(c.hubLabelKey)}`.toLowerCase()
    return haystack.includes(q)
  })
}
