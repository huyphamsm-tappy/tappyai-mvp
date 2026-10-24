/**
 * Round 3c · the turn a request belongs to. A benchmark run may hold several turns in ONE process; every turn gets a token, and the token is
 * carried by AsyncLocalStorage, so a timer, promise or callback created INSIDE a turn keeps that turn's token for life. The network wrappers in
 * liveTrial.ts read the token at every call:
 *   - token open (the turn is running)      → the request may pass;
 *   - token closed (that turn has ended)    → refused before it is sent, even while another turn is running;
 *   - no token at all                       → the run-level flag decides (as before).
 * A reference to fetch that was taken in turn 1 and is CALLED from turn 2's own code runs in turn 2's context: it is not told apart from a request
 * of turn 2 at this layer (stated limitation). The spend gate of each turn is a second layer: a paid request made under a closed turn's gate is
 * refused by that gate before any send.
 * Pure module: no I/O, no network.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

export interface TurnToken { readonly id: string; open: boolean }

const store = new AsyncLocalStorage<TurnToken>()

/** Runs `fn` with `token` as the current turn. Everything created inside `fn` (timers, promises, callbacks) carries the token. */
export function runInTurn<T>(token: TurnToken, fn: () => T): T {
  return store.run(token, fn)
}

/** The token of the turn the current code belongs to, or undefined outside any turn. */
export function currentTurn(): TurnToken | undefined {
  return store.getStore()
}
