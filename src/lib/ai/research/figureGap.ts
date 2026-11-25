// A leaf module (imports nothing) so that deepResearch.ts and consolidate.ts can share this number without importing each other.

/** Relative gap above which two values of one series and label count as a conflict, not as rounding. */
export const FIGURE_CONFLICT_GAP = 0.02
