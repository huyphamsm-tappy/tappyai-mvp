// Group avatar — client-side pre-checks and the one upload call, shared by the create screen
// (`/group/new`) and the creator's edit control on `/group/[id]`.
//
// The server (`POST /api/group/[id]/avatar`) is the authority: magic-byte sniff, 3 MB cap, EXIF
// strip, creator-only. These checks only save a round trip and pick the right message; they never
// replace it. Uses the EXISTING upload route — there is no second pipeline.

export const GROUP_AVATAR_MAX_BYTES = 3 * 1024 * 1024
export const GROUP_AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp'
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** A dictionary key describing why the file cannot be sent, or null when it may be. */
export function groupAvatarPrecheck(file: { type: string; size: number }): string | null {
  if (!ALLOWED.has(file.type)) return 'groupNew.avatarErr.type'
  if (file.size > GROUP_AVATAR_MAX_BYTES) return 'groupNew.avatarErr.size'
  return null
}

export type GroupAvatarResult =
  | { ok: true; url: string }
  | { ok: false; message: string }

/**
 * Uploads `file` as the group's picture. Never reports success unless the server returned the
 * stored URL. `fallback` is the localized generic failure shown when the server sent no message.
 */
export async function uploadGroupAvatar(
  groupId: string,
  file: File,
  fallback: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GroupAvatarResult> {
  const fd = new FormData()
  fd.append('avatar', file)
  try {
    const res = await fetchImpl(`/api/group/${encodeURIComponent(groupId)}/avatar`, { method: 'POST', body: fd })
    const data = (await res.json().catch(() => ({}))) as { avatar_url?: string; message?: string }
    if (!res.ok || !data.avatar_url) return { ok: false, message: data.message || fallback }
    return { ok: true, url: data.avatar_url }
  } catch {
    return { ok: false, message: fallback }
  }
}
