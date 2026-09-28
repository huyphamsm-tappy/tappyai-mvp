import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Is this request from the scheduler? `Authorization: Bearer <CRON_SECRET>`.
 *
 * security-audit L6 — the cron routes compared the header with `!==`, which returns as soon as a
 * byte differs, so response time leaks how much of a guess is right. Over the internet that is
 * noise, not an exploit, but the fix costs nothing: both sides are hashed to 32 bytes (equal
 * length, so the length of the secret is not leaked either) and compared with timingSafeEqual.
 *
 * Fails closed: no CRON_SECRET configured means NOTHING is authorized — including a caller who
 * sends "Bearer undefined", the value a naive template would build.
 */
export function isAuthorizedCronRequest(
  req: { headers: { get(name: string): string | null } },
  env: Record<string, string | undefined> = process.env,
): boolean {
  const secret = env.CRON_SECRET
  if (!secret) return false
  const presented = createHash('sha256').update(req.headers.get('authorization') ?? '').digest()
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest()
  return timingSafeEqual(presented, expected)
}
