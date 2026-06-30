// TODO: Fill with Supabase auth user IDs that should have admin access.
// Find your user ID in Supabase Dashboard → Authentication → Users.
export const ADMIN_IDS: string[] = []

export function isAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false
  return ADMIN_IDS.includes(userId)
}
