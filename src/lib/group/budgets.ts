// The budget choices of the group form. The VALUE is what is stored in group_members.budget and read by Tappy's suggestions, so it stays as the Vietnamese strings that rows already hold
// (changing them would orphan every stored budget); only the LABEL a person sees follows their language (dictionary key beside each value). Pure.

export const GROUP_BUDGETS = [
  { value: 'Dưới 100k', key: 'groupDining.budget.low' },
  { value: '100–200k', key: 'groupDining.budget.mid' },
  { value: 'Trên 200k', key: 'groupDining.budget.high' },
] as const

/** The dictionary key for a stored budget value, or null when it is free text (an older row). */
export function budgetKeyFor(value: string | null | undefined): (typeof GROUP_BUDGETS)[number]['key'] | null {
  return GROUP_BUDGETS.find(b => b.value === value)?.key ?? null
}
