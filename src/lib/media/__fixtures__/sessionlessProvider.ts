// A provider that cannot open an upload session.
//
// Several tests need one to prove the fail-closed behaviour: what happens when a caller reaches the
// session or completion path with a provider that has no `createUploadSession`. That role used to be
// played by the real Vercel Blob provider, which has since been deleted so that Blob writes are
// structurally impossible rather than merely switched off.
//
// Keeping the coverage matters more than keeping the old fixture: the branch it exercises is still
// in the code, and the point of the branch is that it refuses rather than degrades.

import type { MediaBody, MediaProvider, PutMediaOptions, PutMediaResult } from '../types'

export function createSessionlessProvider(
  putImpl?: (key: string, body: MediaBody, opts: PutMediaOptions) => Promise<PutMediaResult>
): MediaProvider {
  return {
    id: 'blob',
    publicUrl: (key: string) => `https://legacy.public.blob.vercel-storage.com/${key}`,
    put: async (key, body, opts) =>
      putImpl ? putImpl(key, body, opts) : { url: `https://legacy.invalid/${key}`, key },
    // No createUploadSession — that absence IS the fixture.
  }
}
