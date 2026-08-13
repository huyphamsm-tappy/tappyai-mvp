// New TappyAI media must not be able to reach Vercel Blob. Structurally, not by configuration.
//
// The bridge shipped with `DEFAULT_MEDIA_PROVIDER = 'blob'` so that turning GCS on, and rolling it
// back, was a single env var. That was right while GCS was unproven. It is now the remaining risk:
// if MEDIA_PROVIDER is ever unset, removed, or misspelled — a new environment, a preview deployment,
// a typo like `GCS` — the app silently returns to writing Blob objects and re-opens the client-token
// handshake, which mints client-chosen object names. The store already hit its transfer ceiling once.
//
// So the rollback switch is deliberately gone. These tests are the thing that keeps it gone.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { activeProviderId, getMediaProvider } from './index'

const root = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const UPLOAD_ROUTES = [
  'src/app/api/upload/video/route.ts',
  'src/app/api/upload/audio/route.ts',
  'src/app/api/admin/deals/upload/route.ts',
]

describe('the active provider cannot be Blob', () => {
  it('defaults to GCS when MEDIA_PROVIDER is absent', () => {
    expect(activeProviderId({} as NodeJS.ProcessEnv)).toBe('gcs')
  })

  // The rollback switch is gone on purpose: an env var that can re-enable Blob writes IS the risk.
  it.each(['blob', 'BLOB', '', 'Blob', 'vercel-blob', 'gcs', 'GCS'])(
    'stays GCS even when MEDIA_PROVIDER=%s',
    (value) => {
      expect(activeProviderId({ MEDIA_PROVIDER: value } as unknown as NodeJS.ProcessEnv)).toBe('gcs')
    }
  )

  it('hands out a GCS provider whatever the environment says', () => {
    for (const env of [{}, { MEDIA_PROVIDER: 'blob' }, { MEDIA_PROVIDER: 'nonsense' }]) {
      expect(getMediaProvider(env as NodeJS.ProcessEnv).id).toBe('gcs')
    }
  })

  it('exposes an upload-session capability, so no caller can fall back for lack of one', () => {
    // `createUploadSessionResponse` answers "blob" when the provider has no session concept. With
    // Blob gone that branch must be unreachable.
    expect(typeof getMediaProvider({} as NodeJS.ProcessEnv).createUploadSession).toBe('function')
  })
})

describe('no production code can write to Blob', () => {
  it('the Blob provider no longer exists', () => {
    expect(existsSync(join(root, 'src/lib/media/providers/blob.ts'))).toBe(false)
  })

  it('the media surface does not import a Blob provider', () => {
    const index = read('src/lib/media/index.ts')
    expect(index).not.toContain('createBlobProvider')
    expect(index).not.toContain('@vercel/blob')
  })

  it.each(UPLOAD_ROUTES)('%s cannot serve the client-token handshake', (rel) => {
    const src = read(rel)
    expect(src).not.toContain('@vercel/blob')
    expect(src).not.toContain('handleUpload')
    expect(src).not.toContain('onBeforeGenerateToken')
  })

  it('the upload client cannot PUT to Blob', () => {
    const src = read('src/lib/media/client.ts')
    expect(src).not.toContain('@vercel/blob')
    expect(src).not.toContain('blobUpload')
  })

  it('the dependency itself is gone, so nothing can import it again', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    expect(pkg.dependencies?.['@vercel/blob']).toBeUndefined()
    expect(pkg.devDependencies?.['@vercel/blob']).toBeUndefined()
  })

  it('nothing under src imports @vercel/blob outside tests', async () => {
    const { globSync } = await import('tinyglobby')
    const offenders = globSync(['src/**/*.ts', 'src/**/*.tsx'], { cwd: root })
      .filter((f) => !f.includes('.test.'))
      .filter((f) => read(f).includes('@vercel/blob'))
    expect(offenders).toEqual([])
  })
})

describe('the legacy handshake is not merely disabled but absent', () => {
  it('legacyBlobHandshakeAllowed is no longer exported', async () => {
    const mod = await import('./uploadRoute')
    expect('legacyBlobHandshakeAllowed' in mod).toBe(false)
  })

  it('a Blob-shaped session response can no longer be produced', () => {
    expect(read('src/lib/media/uploadRoute.ts')).not.toContain("{ provider: 'blob' }")
  })
})

describe('no mobile client can write to Blob either', () => {
  // The web is not the only uploader. Android and iOS talk to the same endpoints, so a client that
  // still knew the Blob handshake would be a second way back into the store.
  const mobileSources = () => {
    const { globSync } = require('tinyglobby') as typeof import('tinyglobby')
    return [
      ...globSync(['android/app/src/main/**/*.kt'], { cwd: root }),
      ...globSync(['ios/TappyAI/**/*.swift'], { cwd: root }),
    ]
  }

  it('finds the mobile sources at all, so these assertions are not vacuous', () => {
    expect(mobileSources().length).toBeGreaterThan(50)
  })

  it.each([
    ['a Blob storage host', /vercel-storage\.com/i],
    ['the Blob client-token handshake', /generate-client-token/i],
    ['a Blob read-write token', /BLOB_READ_WRITE_TOKEN/i],
  ])('no Android or iOS source mentions %s', (_what, pattern) => {
    const offenders = mobileSources().filter((f) => pattern.test(read(f)))
    expect(offenders).toEqual([])
  })
})

describe('every upload kind goes through the server-owned key policy', () => {
  // Review photo, review video, thumbnail, audio and deal media all resolve through the same
  // policy. If a kind were missing, its uploads would have no server-owned key at all.
  it('covers every kind the endpoints accept', async () => {
    const { MEDIA_UPLOAD_POLICIES } = await import('./uploadPolicy')
    for (const kind of ['video', 'videoThumbnail', 'audio', 'dealLogo', 'dealBanner'] as const) {
      expect(MEDIA_UPLOAD_POLICIES[kind]).toBeDefined()
    }
  })
})

describe('reading historical Blob URLs is unaffected', () => {
  // Deleting the write path must not change how already-stored absolute URLs resolve. They are
  // filtered from responses by servableMedia, which is a separate concern and stays as it is.
  it('mediaUrl still passes an absolute URL through untouched', async () => {
    const { mediaUrl } = await import('./index')
    const url = 'https://example.public.blob.vercel-storage.com/reviews/old.mp4'
    expect(mediaUrl(url, getMediaProvider({} as NodeJS.ProcessEnv))).toBe(url)
  })
})
