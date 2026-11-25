// Account deletion for the DELIVERY bucket (Explore video). Same contract as the source-bucket deleter (sourceDeletion.ts) and the chat-media deleter: called by the
// account-deletion job (src/lib/account/deletionJobs.ts, dep `videoDelivery`), it THROWS on any failure, which keeps the job pending and retried, so "done" is never reported
// while an approved copy of a deleted user's video may still be served.
//
// Removes ALL of ONE owner's delivery copies (`vdel/<uuid>/`, validated and owner-scoped, never a bucket-wide listing): list, delete, LIST AGAIN, and the owner's CDN path
// is invalidated so cached copies go too. With no delivery bucket configured (the feature was never switched on) there is nothing to delete and the answer is 0. Rows of a
// deleted account are removed by the database cascade (20261111_video_assets.sql).

import { videoDeliveryPrefix } from '../key'
import type { MediaProvider } from '../types'
import type { CdnInvalidator } from './cdnInvalidate'

export function createVideoDeliveryDeleter(provider: MediaProvider | null, cdn: CdnInvalidator | null): { deleteForUser(userId: string): Promise<number> } {
  return {
    async deleteForUser(userId: string): Promise<number> {
      // Validated BEFORE anything is asked of storage.
      const prefix = videoDeliveryPrefix(userId)
      if (!provider) return 0
      if (!provider.listObjects || !provider.deleteObject) throw new Error('video delivery: provider cannot list or delete')

      const keys = await provider.listObjects(prefix)
      let deleted = 0
      for (const key of keys) {
        if (await provider.deleteObject(key)) deleted++
      }
      if ((await provider.listObjects(prefix)).length > 0) throw new Error('video delivery: objects remain after deletion')

      if (keys.length > 0) {
        // Edge copies of what was just deleted: without the invalidation they can be served until their cache lifetime ends.
        if (!cdn) throw new Error('video delivery: cdn invalidation is not configured')
        await cdn.invalidate(`/vdel/${userId}/*`)
      }
      return deleted
    },
  }
}
