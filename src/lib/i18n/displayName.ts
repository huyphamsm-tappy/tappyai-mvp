/**
 * The name to greet someone by, and the word to use when we do not know it.
 *
 * ============================================================================
 * WHAT WAS WRONG (C14)
 * ============================================================================
 * Four places independently wrote:
 *
 *     user?.full_name?.split(' ').pop() || user?.email?.split('@')[0] || 'bạn'
 *
 * — `src/app/page.tsx`, `src/components/Header.tsx`, `src/app/profile/page.tsx` and
 * `src/app/profile/account/page.tsx`. The previous fix round removed the Vietnamese literal from
 * ONE of them, so an English session still read **"Good morning, bạn"** on `/`, `/profile` and
 * `/login` — the Header being the worst of the four, because it renders on nearly every screen.
 *
 * Fixing the fourth copy would have left the pattern intact for the fifth. This is the pattern,
 * once, with the fallback word coming from the dictionary like every other word in the product.
 *
 * 🚨 `resolveFirstName` deliberately returns an EMPTY string rather than a fallback. The caller is
 * the only thing that knows whether it can translate, so the two jobs stay separate: this file
 * derives the name, `useTranslation` supplies the word. A default argument here would put a
 * language back into a module that has no business choosing one.
 */

export interface NameBearer {
  full_name?: string | null
  email?: string | null
}

/**
 * The short name to address someone by: the last word of their display name, else the local part of
 * their email, else `''`.
 *
 * The last word is used because Vietnamese names are written family-name-first, so the given name —
 * the one a person is actually called by — is last.
 */
export function resolveFirstName(user: NameBearer | null | undefined): string {
  const fromName = user?.full_name?.trim().split(/\s+/).pop()
  if (fromName) return fromName
  const fromEmail = user?.email?.split('@')[0]?.trim()
  if (fromEmail) return fromEmail
  return ''
}

/**
 * The same name, with the caller's localized fallback applied.
 *
 * `t` is passed in rather than imported so this stays usable from a server component that has
 * already resolved its own strings, and so the module keeps no dependency on the client store.
 */
export function displayName(
  user: NameBearer | null | undefined,
  t: (key: string) => string,
): string {
  return resolveFirstName(user) || t('home.friend')
}
