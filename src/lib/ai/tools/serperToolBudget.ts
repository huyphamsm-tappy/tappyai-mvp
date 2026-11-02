// ── Serper budgets for the bounded agent: per TURN and per TOOL invocation ─────────────────────────────────────────────────
//
// The agent may make at most 3 tool calls per turn (src/lib/ai/agent/loop.ts), and ONE tool can fan out to many provider requests
// inside (a product search measured 11 credits). Two caps, both enforced in serperAdmit:
//   · per turn  — `withSerperTurnBudget(limit, fn)` around the whole agent turn (8 credits; 10 for a travel plan): credits never add up
//                 past it across tools;
//   · per tool  — `withSerperToolBudget(limit, fn)` around one tool invocation (provider fan-out).
// A refused call returns `null` from serperPost, which every tool already treats as "no result". Outside these scopes nothing changes —
// the legacy path is not affected.

import { AsyncLocalStorage } from 'node:async_hooks'

interface Scope { limit: number; spent: number; refused: number; parent: Scope | null }
const store = new AsyncLocalStorage<Scope>()

async function within<T>(limit: number, fn: () => Promise<T>): Promise<{ value: T; spent: number; refused: number }> {
  const scope: Scope = { limit, spent: 0, refused: 0, parent: store.getStore() ?? null }
  const value = await store.run(scope, fn)
  return { value, spent: scope.spent, refused: scope.refused }
}

/** One agent tool invocation: its own cap, nested inside the turn's cap. */
export const withSerperToolBudget = within
/** The whole agent turn. */
export const withSerperTurnBudget = within

/**
 * One budget shared by several pieces of work that may run at different times or concurrently (the agent turn's after-loop
 * lookups: card photos + the TikTok review search). Every `run` spends from the same scope, so together they never pass `limit`.
 */
export function sharedSerperBudget(limit: number): { run<T>(fn: () => Promise<T>): Promise<T>; spent(): number } {
  const scope: Scope = { limit, spent: 0, refused: 0, parent: null }
  return { run: fn => store.run(scope, fn), spent: () => scope.spent }
}

/** Called by serperAdmit before the daily ceiling. false = refuse this call (a cap on this call's scope chain is spent). */
export function admitWithinToolBudget(credits: number): boolean {
  const chain: Scope[] = []
  for (let s = store.getStore() ?? null; s; s = s.parent) chain.push(s)
  if (chain.length === 0) return true
  if (chain.some(s => s.spent + credits > s.limit)) { chain[0].refused++; return false }
  for (const s of chain) s.spent += credits
  return true
}

/** Credits spent so far in the current turn scope (0 outside one). */
export function turnCreditsSpent(): number {
  let s = store.getStore() ?? null
  while (s?.parent) s = s.parent
  return s?.spent ?? 0
}
