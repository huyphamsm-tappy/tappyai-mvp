import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { activationInputFromResult, toRpcParams, upsertActivation } from './activationDimensionWriter'
import type { RuleEvaluationResult } from './activationRuleEngine'

describe('activationInputFromResult', () => {
  it('maps an activating result to an upsert input, using the latest matched-signal timestamp', () => {
    const result: RuleEvaluationResult = {
      activation_rule_version: 'v1',
      evaluation_time: '2026-07-14T00:10:00Z',
      matched_signals: { ai_answer: '2026-07-14T00:00:00Z', place_saved: '2026-07-14T00:05:00Z' },
      missing_signals: [],
      activation_result: true,
    }
    expect(activationInputFromResult('u1', result)).toEqual({
      user_id: 'u1', activated_at: '2026-07-14T00:05:00Z', activation_rule_version: 'v1',
    })
  })

  it('returns null for a non-activating result', () => {
    const result: RuleEvaluationResult = {
      activation_rule_version: 'v1', evaluation_time: 't',
      matched_signals: { ai_answer: 't' }, missing_signals: ['place_saved'], activation_result: false,
    }
    expect(activationInputFromResult('u1', result)).toBeNull()
  })

  it('returns null when activation_result is true but no signals matched (defensive)', () => {
    const result: RuleEvaluationResult = {
      activation_rule_version: 'v1', evaluation_time: 't',
      matched_signals: {}, missing_signals: [], activation_result: true,
    }
    expect(activationInputFromResult('u1', result)).toBeNull()
  })
})

describe('toRpcParams', () => {
  it('maps fields to p_* params', () => {
    expect(toRpcParams({ user_id: 'u1', activated_at: 't1', activation_rule_version: 'v1' })).toEqual({
      p_user_id: 'u1', p_activated_at: 't1', p_activation_rule_version: 'v1',
    })
  })
})

describe('upsertActivation', () => {
  it('calls the single merge RPC with mapped params and returns no error on success', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const client = { rpc } as unknown as SupabaseClient
    const res = await upsertActivation({ user_id: 'u1', activated_at: 't1', activation_rule_version: 'v1' }, client)
    expect(rpc).toHaveBeenCalledWith('fn_upsert_activation', {
      p_user_id: 'u1', p_activated_at: 't1', p_activation_rule_version: 'v1',
    })
    expect(res.error).toBeNull()
  })

  it('surfaces the error object when the RPC fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
    const client = { rpc } as unknown as SupabaseClient
    const res = await upsertActivation({ user_id: 'u1', activated_at: 't1', activation_rule_version: 'v1' }, client)
    expect(res.error).toEqual({ message: 'boom' })
  })
})
