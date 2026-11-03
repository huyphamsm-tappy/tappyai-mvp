// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, cleanup } from '@testing-library/react'
import { persistChatSessionId, readChatSessionId, useChatSessionId } from './useChatSessionId'

// Regression: the ids of turn 1 (/chat) and turn 2 (/chat/<rowId>, after router.replace remounts ChatInterface) differed on the dev
// server (measured: turn 1 sent f983279a…, the pending slot held 952d305e…, the remount adopted 952d305e…). conversation_id changed
// and loaded:false at turn 2, so the saved task / pending question never arrived and the agent asked the same question again.
// Cause: the id was minted AND written to sessionStorage inside a useState initializer; React calls an initializer twice in
// development and keeps ONE result, so the id kept and the id stored were different.

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
afterEach(cleanup)

/** The ORIGINAL initializer, verbatim — kept here only to prove the test reproduces the defect. */
function legacyInitializer(conversationId: string | undefined, isContinuation: boolean): string {
  const fresh = () => crypto.randomUUID()
  const slot = conversationId ? `tappy_chat_session:${conversationId}` : null
  const own = slot ? localStorage.getItem(slot) : null
  if (own) return own
  const pending = isContinuation ? sessionStorage.getItem('tappy_chat_session:pending') : null
  const id = pending ?? fresh()
  if (slot) { localStorage.setItem(slot, id); sessionStorage.removeItem('tappy_chat_session:pending') }
  else sessionStorage.setItem('tappy_chat_session:pending', id)
  return id
}

/** What React does in development: call the initializer twice and keep ONE result (the first). */
const doubleInvoke = <T,>(init: () => T): T => { const kept = init(); init(); return kept }

describe('chatSessionId across the /chat → /chat/<id> remount', () => {
  it('reproduces the defect with the original initializer (double-invoked): the remount adopts a different id', () => {
    const turn1 = doubleInvoke(() => legacyInitializer(undefined, false))
    const remount = doubleInvoke(() => legacyInitializer('row-1', true))
    expect(remount).not.toBe(turn1)
  })

  it('the read-only initializer + effect keeps the id turn 1 used, even when the initializer runs twice', () => {
    const turn1 = doubleInvoke(() => readChatSessionId(undefined, false))
    persistChatSessionId(turn1, undefined) // the mount effect
    const remount = doubleInvoke(() => readChatSessionId('row-1', true))
    expect(remount).toBe(turn1)
    persistChatSessionId(remount, 'row-1')
    expect(localStorage.getItem('tappy_chat_session:row-1')).toBe(turn1)
    expect(sessionStorage.getItem('tappy_chat_session:pending')).toBeNull()
  })

  it('the initializer writes nothing', () => {
    readChatSessionId(undefined, false); readChatSessionId('row-1', true)
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('reopening the row later keeps the id; a new chat gets a new one; a fresh chat ignores an abandoned pending id', () => {
    const turn1 = readChatSessionId(undefined, false); persistChatSessionId(turn1, undefined)
    const again = readChatSessionId('row-1', true); persistChatSessionId(again, 'row-1')
    expect(readChatSessionId('row-1', true)).toBe(turn1)
    const fresh = readChatSessionId(undefined, false)
    expect(fresh).not.toBe(turn1)
    persistChatSessionId(fresh, undefined)
    const other = readChatSessionId(undefined, false)
    expect(other).not.toBe(fresh) // not a continuation → never adopts the pending id
  })

  it('end to end with the hook under React.StrictMode: the remounted component holds the id of the first', () => {
    let held = ''
    function Probe({ conversationId, isContinuation }: { conversationId?: string; isContinuation: boolean }) {
      held = useChatSessionId(conversationId, isContinuation)
      return null
    }
    const first = render(<React.StrictMode><Probe isContinuation={false} /></React.StrictMode>)
    const turn1 = held
    first.unmount()
    render(<React.StrictMode><Probe conversationId="row-1" isContinuation /></React.StrictMode>)
    expect(held).toBe(turn1)
  })
})
