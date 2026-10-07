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

describe('App Links — the Android side is prepared and matches the server statement', () => {
  const fs = require('node:fs') as typeof import('node:fs')
  const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')
  const gradle = fs.readFileSync('android/app/build.gradle.kts', 'utf8')
  it('the package the statement names is the applicationId the app builds with', () => {
    expect(gradle).toContain('applicationId = "com.tappyai.app"')
    expect(assetLinks(env({ ANDROID_APP_LINKS_SHA256: FP }))![0]).toMatchObject({ target: { package_name: 'com.tappyai.app' } })
  })
  it('the app claims /r/ only, through an alias that is disabled unless the build enables it', () => {
    const alias = manifest.split('<activity-alias')[1]?.split('</activity-alias>')[0] ?? ''
    expect(alias).toContain('android:autoVerify="true"')
    expect(alias).toContain('android:pathPrefix="/r/"')
    expect(alias).toContain('android:enabled="@bool/tappy_app_links_enabled"')
    expect(gradle).toMatch(/resValue\("bool", "tappy_app_links_enabled", \(project\.findProperty\("TAPPYAI_APP_LINKS_ENABLED"\)\?\.toString\(\) == "true"\)\.toString\(\)\)/)
    expect(UNIVERSAL_LINK_PATHS[0]).toBe('/r/*')
  })
})
