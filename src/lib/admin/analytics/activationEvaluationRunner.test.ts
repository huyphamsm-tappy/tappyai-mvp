import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toDomainEvent, evaluateAndUpsertActivation } from './activationEvaluationRunner'
import type { ActivationRuleProvider } from './activationRuleProvider'
import { ACTIVATION_RULE_V1 } from './activationRules/registry'

describe('toDomainEvent', () => {
  it('adapts a raw user_events row to the Engine shape', () => {
    expect(toDomainEvent({
      event_type: 'chat_response_received', metadata: { feature: 'food' },
      session_id: 's1', client_timestamp: '2026-07-14T00:00:00Z',
    })).toEqual({
      event_type: 'chat_response_received', properties: { feature: 'food' },
      session_id: 's1', client_timestamp: '2026-07-14T00:00:00Z',
    })
  })

  it('defaults missing metadata/session_id/client_timestamp', () => {
    expect(toDomainEvent({ event_type: 'search_result_saved' })).toEqual({
      event_type: 'search_result_saved', properties: {}, session_id: null, client_timestamp: '',
    })
  })
})

describe('evaluateAndUpsertActivation', () => {
  const provider: ActivationRuleProvider = {
    getActiveRule: () => ACTIVATION_RULE_V1,
    getRuleById: (id) => (id === ACTIVATION_RULE_V1.id ? ACTIVATION_RULE_V1 : null),
  }

  it('upserts activation when the user has satisfied the rule', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const client = { rpc } as unknown as SupabaseClient
    const events = [
      { event_type: 'chat_response_received', session_id: 's1', client_timestamp: '2026-07-14T00:00:00Z' },
      { event_type: 'search_result_saved', session_id: 's1', client_timestamp: '2026-07-14T00:05:00Z' },
    ]
    const res = await evaluateAndUpsertActivation('u1', events, client, provider)
    expect(res.activated).toBe(true)
    expect(rpc).toHaveBeenCalledWith('fn_upsert_activation', {
      p_user_id: 'u1', p_activated_at: '2026-07-14T00:05:00Z', p_activation_rule_version: 'v1',
    })
  })

  it('does not call the RPC when the user has not satisfied the rule', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const client = { rpc } as unknown as SupabaseClient
    const events = [{ event_type: 'chat_response_received', session_id: 's1', client_timestamp: '2026-07-14T00:00:00Z' }]
    const res = await evaluateAndUpsertActivation('u1', events, client, provider)
    expect(res.activated).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('is a no-op when there is no active rule', async () => {
    const rpc = vi.fn()
    const client = { rpc } as unknown as SupabaseClient
    const noRuleProvider: ActivationRuleProvider = { getActiveRule: () => null, getRuleById: () => null }
    const res = await evaluateAndUpsertActivation('u1', [], client, noRuleProvider)
    expect(res).toEqual({ activated: false, error: null })
    expect(rpc).not.toHaveBeenCalled()
  })
})
