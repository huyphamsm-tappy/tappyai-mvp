import { describe, it, expect } from 'vitest'
import { assetLinks, appleAppSiteAssociation, androidFingerprints, UNIVERSAL_LINK_PATHS } from './appLinks'

const FP = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99'
const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv

describe('App Links / Universal Links association files — inert until configured', () => {
  it('serve nothing without configuration', () => {
    expect(assetLinks(env({}))).toBeNull()
    expect(appleAppSiteAssociation(env({}))).toBeNull()
    expect(assetLinks(env({ ANDROID_APP_LINKS_SHA256: 'not-a-fingerprint' }))).toBeNull()
    expect(appleAppSiteAssociation(env({ IOS_UNIVERSAL_LINKS_APP_ID: 'nope' }))).toBeNull()
  })
  it('produce the standard statements once configured', () => {
    expect(androidFingerprints(env({ ANDROID_APP_LINKS_SHA256: `${FP.toLowerCase()}, junk` }))).toEqual([FP])
    expect(assetLinks(env({ ANDROID_APP_LINKS_SHA256: FP }))).toEqual([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.tappyai.app', sha256_cert_fingerprints: [FP] } }])
    const aasa = appleAppSiteAssociation(env({ IOS_UNIVERSAL_LINKS_APP_ID: 'ABCDE12345.com.tappyai.app' })) as { applinks: { details: { appID: string; paths: string[] }[] } }
    expect(aasa.applinks.details[0].appID).toBe('ABCDE12345.com.tappyai.app')
    expect(aasa.applinks.details[0].paths).toEqual([...UNIVERSAL_LINK_PATHS])
  })
  it('only ever claims public surfaces', () => {
    for (const p of UNIVERSAL_LINK_PATHS) expect(p).not.toMatch(/^\/(chat|api|admin|profile|login)/)
  })
})
