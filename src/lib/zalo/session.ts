import type { ZaloProfile } from './identity'

// Turning a VERIFIED Zalo identity into a TappyAI session.
//
// This used to live in `POST /api/auth/zalo/complete`, which the browser called after the OAuth
// callback handed it the access token in a URL fragment. The token no longer leaves the server
// (see the callback route), so this is now a plain function the callback calls in-process, and
// `/auth/zalo-finish` and `/api/auth/zalo/complete` are gone.
//
// 🚨 CREATE ONLY, NEVER UPDATE. `createUser` fails for an account that already exists and the
// "already registered" error is swallowed on purpose: a returning user keeps the avatar and name
// they chose in TappyAI. Adding an update here would overwrite them with the Zalo ones on every
// single login (pinned by src/lib/media/avatarSourcePolicy.test.ts).

export type ZaloPlatform = 'ios' | 'android' | 'web'

/** The subset of the Supabase admin client this needs. Keeps the callback route testable. */
export type ZaloAdminClient = {
  auth: {
    admin: {
      createUser(args: {
        email: string
        email_confirm: boolean
        user_metadata: Record<string, unknown>
      }): Promise<{ error: { message?: string } | null }>
      generateLink(args: {
        type: 'magiclink'
        email: string
        options: { redirectTo: string }
      }): Promise<{
        data?: { properties?: { hashed_token?: string } | null } | null
        error: { message?: string } | null
      }>
    }
  }
}

/** `zalo_<id>@zalo.tappyai.com` — the account the verified id maps to, and the only mapping. */
export function zaloEmail(zaloId: string): string {
  return `zalo_${zaloId}@zalo.tappyai.com`
}

/** A path we are willing to send a freshly signed-in person to. Never an absolute URL. */
export function safeNext(value: string | null | undefined): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

/**
 * Ensure the account exists and return the one-time `/auth/confirm` URL that signs it in.
 *
 * `profile.id` must already have been verified against Zalo by the caller. `name` and `avatar`
 * are display fields for a newly created user and decide nothing.
 */
export async function zaloConfirmUrl(
  admin: ZaloAdminClient,
  input: { profile: ZaloProfile; origin: string; next: string; platform: ZaloPlatform },
): Promise<string> {
  const { profile, origin, platform } = input
  const next = safeNext(input.next)
  const email = zaloEmail(profile.id)

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      zalo_id: profile.id,
      full_name: profile.name || 'Người dùng Zalo',
      avatar_url: profile.avatar,
      provider: 'zalo',
    },
  })
  if (createErr && !createErr.message?.toLowerCase().includes('already')) throw createErr

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${origin}${next}` },
  })
  const hashed = data?.properties?.hashed_token
  if (error || !hashed) throw error || new Error('Magic link failed')

  // The native apps come back through the same page and leave via their custom scheme.
  return `${origin}/auth/confirm?token_hash=${hashed}&type=magiclink&next=${encodeURIComponent(next)}${
    platform !== 'web' ? `&platform=${platform}` : ''
  }`
}
