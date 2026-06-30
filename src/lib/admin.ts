export const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').filter(Boolean)

export function isAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false
  return ADMIN_IDS.includes(userId)
}
