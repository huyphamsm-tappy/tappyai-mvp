// "no deployment identity available" is the same answer for two very different
// causes: the platform never injected a token, or something between the
// platform and this handler dropped it. They have different fixes, so the
// health check has to distinguish them — while still revealing nothing.

import { describe, it, expect } from 'vitest'
import { describeDeploymentIdentity, VERCEL_OIDC_HEADER } from './gcpAuth'

const TOKEN = 'header.token.value'
const req = (headers: Record<string, string>) =>
  new Request('https://www.tappyai.com/api/admin/media/wif-check', { headers })

const noEnv = {} as NodeJS.ProcessEnv
const withEnv = { VERCEL_OIDC_TOKEN: 'env.token.value' } as unknown as NodeJS.ProcessEnv

describe('describeDeploymentIdentity', () => {
  it('reports the header as the source inside a deployed function', () => {
    expect(describeDeploymentIdentity(req({ [VERCEL_OIDC_HEADER]: TOKEN }), noEnv)).toEqual({
      source: 'header',
      headerPresent: true,
      envPresent: false,
    })
  })

  it('reports env as the source in builds and local development', () => {
    expect(describeDeploymentIdentity(req({}), withEnv)).toEqual({
      source: 'env',
      headerPresent: false,
      envPresent: true,
    })
  })

  // The case production is actually in.
  it('reports none when neither source has an identity', () => {
    expect(describeDeploymentIdentity(req({}), noEnv)).toEqual({
      source: 'none',
      headerPresent: false,
      envPresent: false,
    })
  })

  it('agrees with which source readDeploymentOidcToken would pick', () => {
    const both = req({ [VERCEL_OIDC_HEADER]: TOKEN })
    expect(describeDeploymentIdentity(both, withEnv).source).toBe('header')
  })

  // The whole point of a diagnostic is that it is safe to look at.
  it('carries no token material — not the value, not even its length', () => {
    const text = JSON.stringify(describeDeploymentIdentity(req({ [VERCEL_OIDC_HEADER]: TOKEN }), withEnv))
    expect(text).not.toContain(TOKEN)
    expect(text).not.toContain('env.token.value')
    expect(text).not.toContain(String(TOKEN.length))
  })
})
