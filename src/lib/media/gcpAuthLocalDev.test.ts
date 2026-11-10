import { describe, it, expect, afterEach, vi } from 'vitest'
import { createWifTokenSource, localGcloudTokenAllowed, WifExchangeError } from './gcpAuth'

const CONFIG = { projectNumber: '1', poolId: 'p', providerId: 'v', serviceAccountEmail: 'sa@example.iam.gserviceaccount.com' }

afterEach(() => { vi.unstubAllEnvs() })

describe('local-dev gcloud token opt-in', () => {
  it('is allowed only under next dev AND with the explicit variable', () => {
    const uat = { GCS_MEDIA_BUCKET: 'tappyai-media-uat' }
    expect(localGcloudTokenAllowed({ NODE_ENV: 'development', LOCAL_DEV_GCLOUD_TOKEN: 'true', ...uat } as NodeJS.ProcessEnv)).toBe(true)
    // Still pointed at the production public bucket (explicitly or by default): refused.
    expect(localGcloudTokenAllowed({ NODE_ENV: 'development', LOCAL_DEV_GCLOUD_TOKEN: 'true' } as NodeJS.ProcessEnv)).toBe(false)
    expect(localGcloudTokenAllowed({ NODE_ENV: 'development', LOCAL_DEV_GCLOUD_TOKEN: 'true', GCS_MEDIA_BUCKET: 'tappyai-media-prod' } as NodeJS.ProcessEnv)).toBe(false)
    expect(localGcloudTokenAllowed({ NODE_ENV: 'production', LOCAL_DEV_GCLOUD_TOKEN: 'true', ...uat } as NodeJS.ProcessEnv)).toBe(false)
    expect(localGcloudTokenAllowed({ NODE_ENV: 'test', LOCAL_DEV_GCLOUD_TOKEN: 'true' } as NodeJS.ProcessEnv)).toBe(false)
    expect(localGcloudTokenAllowed({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(false)
    expect(localGcloudTokenAllowed({ NODE_ENV: 'development', LOCAL_DEV_GCLOUD_TOKEN: 'TRUE' } as NodeJS.ProcessEnv)).toBe(false)
    expect(localGcloudTokenAllowed({ NODE_ENV: 'development', LOCAL_DEV_GCLOUD_TOKEN: '1' } as NodeJS.ProcessEnv)).toBe(false)
  })

  it('a production-like process still fails closed at the OIDC stage even when the variable is set', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('LOCAL_DEV_GCLOUD_TOKEN', 'true')
    const getToken = createWifTokenSource({ config: CONFIG, getOidcToken: () => null })
    await expect(getToken()).rejects.toBeInstanceOf(WifExchangeError)
    await expect(getToken()).rejects.toMatchObject({ stage: 'oidc' })
  })
})
