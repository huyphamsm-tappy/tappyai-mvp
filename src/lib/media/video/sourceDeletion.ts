// Account deletion for the PRIVATE video bucket (Explore video, parts 3 and 4). Called by the account-deletion job (src/lib/account/deletionJobs.ts), exactly like the
// private chat pictures: the public-bucket listing there cannot see this bucket.
//
// Removes ONE owner's originals (`vsrc/<uuid>/`) and ALL of their transcoder output (`vstg/<uuid>/`, the private staging area in the same bucket). Both prefixes are
// validated and owner-scoped, never a bucket-wide listing. Each is listed, deleted, LISTED AGAIN and must then be empty. Any failure THROWS, which keeps the job
// pending and retried: "done" is never reported while a source or staged video may remain.
//
// With no source bucket configured (the feature was never switched on) there is nothing to delete and the answer is 0.
// Objects of a video whose database row is gone are found by the prefix listing, not by the row, so they ARE removed; rows of deleted accounts are removed by the
// database cascade (20261111_video_assets.sql).

import { videoDownloadPrefix, videoSourcePrefix, videoStagingPrefix } from '../key'
import type { MediaProvider } from '../types'

export function createVideoSourceDeleter(provider: MediaProvider | null): { deleteForUser(userId: string): Promise<number> } {
  return {
    async deleteForUser(userId: string): Promise<number> {
      // Validated BEFORE anything is asked of storage.
      const prefixes = [videoSourcePrefix(userId), videoStagingPrefix(userId), videoDownloadPrefix(userId)]
      if (!provider) return 0
      if (!provider.listObjects || !provider.deleteObject) throw new Error('video source: provider cannot list or delete')

      let deleted = 0
      for (const prefix of prefixes) {
        for (const key of await provider.listObjects(prefix)) {
          if (await provider.deleteObject(key)) deleted++
        }
      }
      for (const prefix of prefixes) {
        if ((await provider.listObjects(prefix)).length > 0) throw new Error('video source: objects remain after deletion')
      }
      return deleted
    },
  }
}
