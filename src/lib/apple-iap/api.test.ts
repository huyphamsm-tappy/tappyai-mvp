import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('jose', () => ({
  importPKCS8: async () => ({}),
  SignJWT: class {
    setProtectedHeader() { return this }
    setIssuedAt() { return this }
    setIssuer() { return this }
    setAudience() { return this }
    setExpirationTime() { return this }
    async sign() { return 'mock.jwt.token' }
  },
}))

import { isTransactionIdNotFoundError, getSubscriptionStatuses } from './api'

describe('isTransactionIdNotFoundError', () => {
  it('identifies Apple 4040010 Transaction id not found errors', () => {
    const err = new Error('App Store Server API 404 at /inApps/v1/subscriptions/123: {"errorCode":4040010,"errorMessage":"Transaction id not found."}')
    expect(isTransactionIdNotFoundError(err)).toBe(true)
  })

  it('identifies errors containing TransactionIdNotFoundError', () => {
    const err = new Error('App Store Server API 404: TransactionIdNotFoundError')
    expect(isTransactionIdNotFoundError(err)).toBe(true)
  })

  it('returns false for generic 404s', () => {
    const err = new Error('App Store Server API 404 at /unknown/endpoint: Not found')
    expect(isTransactionIdNotFoundError(err)).toBe(false)
  })

  it('returns false for 500 or network errors', () => {
    expect(isTransactionIdNotFoundError(new Error('App Store Server API 500 at /inApps/v1/subscriptions/123: Internal Server Error'))).toBe(false)
    expect(isTransactionIdNotFoundError(new Error('Network request failed'))).toBe(false)
    expect(isTransactionIdNotFoundError(null)).toBe(false)
    expect(isTransactionIdNotFoundError('string error')).toBe(false)
  })
})

describe('getSubscriptionStatuses — sandbox retry policy', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.APPLE_IAP_ISSUER_ID = 'test-issuer'
    process.env.APPLE_IAP_KEY_ID = 'test-key'
    process.env.APPLE_IAP_PRIVATE_KEY = 'test-p8-key'
    process.env.APPLE_IAP_BUNDLE_ID = 'com.tappyai.ios'
    delete process.env.APPLE_IAP_ENV
    delete process.env.APPLE_IAP_ALLOW_SANDBOX
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('does NOT retry to Sandbox when APPLE_IAP_ALLOW_SANDBOX is absent (default OFF)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ errorCode: 4040010, errorMessage: 'Transaction id not found.' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(getSubscriptionStatuses('123456')).rejects.toThrow('App Store Server API 404')
    // Called once on production, never called on sandbox
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('api.storekit.itunes.apple.com')
  })

  it('retries to Sandbox when APPLE_IAP_ALLOW_SANDBOX is 1 and primary returns 4040010', async () => {
    const mockData = { bundleId: 'com.tappyai.ios', environment: 'Sandbox', data: [] }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ errorCode: 4040010, errorMessage: 'Transaction id not found.' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData,
      })
    vi.stubGlobal('fetch', fetchMock)

    process.env.APPLE_IAP_ALLOW_SANDBOX = '1'
    const result = await getSubscriptionStatuses('123456')
    expect(result).toEqual(mockData)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toContain('api.storekit.itunes.apple.com')
    expect(fetchMock.mock.calls[1][0]).toContain('api.storekit-sandbox.itunes.apple.com')
  })

  it('does NOT retry to Sandbox on non-4040010 errors even when flag is ON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })
    vi.stubGlobal('fetch', fetchMock)

    process.env.APPLE_IAP_ALLOW_SANDBOX = '1'
    await expect(getSubscriptionStatuses('123456')).rejects.toThrow('App Store Server API 500')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('api.storekit.itunes.apple.com')
  })
})
