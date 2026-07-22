import { z } from 'zod'

// Grant-role request (05_API_Architecture.md §9). Role values match the
// admin_role enum (04 §4.1 / Data Dictionary §5).
export const GrantRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['super_admin', 'admin', 'moderator', 'analyst']),
  notes: z.string().max(500).optional(),
  expires_at: z.string().datetime().optional(),
})

export type GrantRoleInput = z.infer<typeof GrantRoleSchema>
