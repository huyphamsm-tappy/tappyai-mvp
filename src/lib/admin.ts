// TODO: Set ADMIN_IDS in Vercel environment variables

export const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean)

export function isAdmin(userId?: string) {
  return !!userId && ADMIN_IDS.includes(userId)
}
