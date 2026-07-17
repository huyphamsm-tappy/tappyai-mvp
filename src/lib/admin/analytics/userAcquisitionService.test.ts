import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  acquisitionFromSignupEvent,
  acquisitionFromLoginEvent,
  toRpcParams,
  upsertAcquisition,
} from './userAcquisitionService'

describe('acquisitionFromSignupEvent', () => {
  it('maps envelope + metadata to the durable signup fields', () => {
    const out = acquisitionFromSignupEvent({
      user_id: 'u1', anon_id: 'a1', platform: 'web', app_version: '1.2.3',
      device_type: 'desktop', country: 'VN', language: 'vi',
      client_timestamp: '2026-07-13T10:00:00Z',
      metadata: { method: 'google', acquisition_source: 'utm_x' },
    })
    expect(out).toEqual({
      user_id: 'u1', anon_id: 'a1', signup_method: 'google', signup_platform: 'web',
      signup_app_version: '1.2.3', signup_device_type: 'desktop', signup_country: 'VN',
      signup_language: 'vi', acquisition_source: 'utm_x',
      signup_at: '2026-07-13T10:00:00Z', first_login_at: '2026-07-13T10:00:00Z',
    })
  })

  it('defaults acquisition_source to organic when absent', () => {
    const out = acquisitionFromSignupEvent({ user_id: 'u1', platform: 'ios', metadata: { method: 'apple' } })
    expect(out?.acquisition_source).toBe('organic')
    expect(out?.signup_method).toBe('apple')
    expect(out?.signup_platform).toBe('ios')
  })

  it('returns null when the event has no user_id', () => {
    expect(acquisitionFromSignupEvent({ anon_id: 'a1', metadata: { method: 'google' } })).toBeNull()
  })
})

describe('acquisitionFromLoginEvent', () => {
  it('advances last_login_at and sets first_login_at only on first login', () => {
    const first = acquisitionFromLoginEvent({ user_id: 'u1', client_timestamp: 't1', metadata: { is_first_login: true } })
    expect(first).toEqual({ user_id: 'u1', last_login_at: 't1', first_login_at: 't1' })

    const returning = acquisitionFromLoginEvent({ user_id: 'u1', client_timestamp: 't2', metadata: { is_first_login: false } })
    expect(returning).toEqual({ user_id: 'u1', last_login_at: 't2', first_login_at: null })
  })

  it('returns null without user_id', () => {
    expect(acquisitionFromLoginEvent({ anon_id: 'a1' })).toBeNull()
  })
})

describe('toRpcParams', () => {
  it('maps all fields to p_* params, nulling the absent ones', () => {
    expect(toRpcParams({ user_id: 'u1', signup_method: 'zalo', signup_platform: 'android' })).toEqual({
      p_user_id: 'u1', p_anon_id: null, p_signup_method: 'zalo', p_signup_platform: 'android',
      p_signup_app_version: null, p_signup_device_type: null, p_signup_country: null,
      p_signup_language: null, p_acquisition_source: null, p_signup_at: null,
      p_first_login_at: null, p_last_login_at: null,
    })
  })
})

describe('upsertAcquisition', () => {
  it('calls the single merge RPC with mapped params and returns no error on success', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const client = { rpc } as unknown as SupabaseClient
    const res = await upsertAcquisition({ user_id: 'u1', signup_method: 'email_otp' }, client)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('fn_upsert_user_acquisition', expect.objectContaining({
      p_user_id: 'u1', p_signup_method: 'email_otp',
    }))
    expect(res.error).toBeNull()
  })

  it('surfaces the error object when the RPC fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
    const client = { rpc } as unknown as SupabaseClient
    const res = await upsertAcquisition({ user_id: 'u1' }, client)
    expect(res.error).toEqual({ message: 'boom' })
  })
})
