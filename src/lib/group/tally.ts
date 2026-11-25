// The count of a group's vote (owner 20/11: one vote per person, changeable; a place is chosen as soon as MORE THAN HALF of the participants vote for it). Pure.
export interface Vote { user_id: string; option_id: string }
export interface Tally {
  counts: Record<string, number>
  /** people who have a counted vote */
  voted: number
  /** the option with MORE than half of the participants' votes, or null */
  majority: string | null
  /** every participant has voted (so a leader's choice is allowed when there is no majority) */
  allVoted: boolean
}

/** `participants` = the creator plus the accepted members. A vote for something that is not an option, and a second vote of the same person (the later row wins), are not counted. */
export function tally(participants: number, votes: readonly Vote[], optionIds: readonly string[]): Tally {
  const options = new Set(optionIds)
  const last = new Map<string, string>()
  for (const v of votes) if (options.has(v.option_id)) last.set(v.user_id, v.option_id)
  const counts: Record<string, number> = Object.fromEntries(optionIds.map(id => [id, 0]))
  for (const opt of last.values()) counts[opt]++
  const majority = participants > 0 ? optionIds.find(id => counts[id] * 2 > participants) ?? null : null
  return { counts, voted: last.size, majority, allVoted: participants > 0 && last.size >= participants }
}
