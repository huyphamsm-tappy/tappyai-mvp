// Avatar / cover upload — what to tell the user when the response carried no message of its own.
//
// `POST /api/profile` answers every failure it handles with a localized `message`, and the
// callers show it. Two failures never reach that handler, so they arrive with no JSON body:
//
//   · 413 — Vercel refuses a function request body over ~4.5MB before the route runs. The cover
//     pre-check allows 5MB (`MAX_PHOTO_SIZE_MB`), so a 4.5–5MB cover used to surface as the
//     generic "couldn't update the cover" with no hint that the file size was the problem.
//   · 502 / 503 / 504 — the platform or the storage service is down or timed out.
//
// Returns a dictionary key, or null when the status has no more specific wording than the
// caller's own generic fallback.
export function uploadErrorKey(status: number | undefined): string | null {
  if (status === 413) return 'editProfile.err.requestTooLarge'
  if (status === 502 || status === 503 || status === 504) return 'editProfile.err.uploadUnavailable'
  return null
}
