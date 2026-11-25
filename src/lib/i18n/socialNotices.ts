// Copy of the social notifications written to a post's author (comment, reply, share), in the RECIPIENT's stored language
// (`profiles.language`, read with resolveUserLang; Vietnamese when unset). Kept in src/lib/i18n because the web UI string gate scans src/app.

export type SocialLang = 'vi' | 'en'

const ANON: Record<SocialLang, string> = { vi: 'Ai đó', en: 'Someone' }

/** The short name shown in a title: the last word of the full name (Vietnamese given name), else the localized "someone". */
export function actorShortName(fullName: string | null | undefined, lang: SocialLang): string {
  return fullName?.trim().split(/\s+/).pop() || ANON[lang]
}

/** 00:00 of the current day in Vietnam (UTC+7, no DST), as an ISO instant — the window of the "one share notification per day" rule. */
export function vietnamDayStartIso(now: Date): string {
  const OFFSET = 7 * 60 * 60 * 1000
  const DAY = 24 * 60 * 60 * 1000
  const local = now.getTime() + OFFSET
  return new Date(local - (local % DAY) - OFFSET).toISOString()
}

function clip(body: string): string {
  return '"' + body.slice(0, 60) + (body.length > 60 ? '...' : '') + '"'
}

export function commentNotice(lang: SocialLang, name: string, body: string): { title: string; body: string } {
  return {
    title: lang === 'en' ? `💬 ${name} commented on your review` : `💬 ${name} đã bình luận review của bạn`,
    body: clip(body),
  }
}

export function replyNotice(lang: SocialLang, name: string, body: string): { title: string; body: string } {
  return {
    title: lang === 'en' ? `↩️ ${name} replied to your comment` : `↩️ ${name} đã trả lời bình luận của bạn`,
    body: clip(body),
  }
}

export function shareNotice(lang: SocialLang, name: string, placeName: string | null | undefined): { title: string; body: string } {
  return {
    title: lang === 'en' ? `🔗 ${name} shared your review` : `🔗 ${name} đã chia sẻ review của bạn`,
    body: placeName || (lang === 'en' ? 'See it now' : 'Xem ngay'),
  }
}

/** To a group leader (owner 20/11/2026): someone asked to join the group. Carries the person's short name and the group's name only: never their budget, tastes or area. */
export function groupRequestNotice(lang: SocialLang, name: string, groupName: string | null | undefined): { title: string; body: string } {
  const g = (groupName ?? '').trim().slice(0, 60)
  return {
    title: lang === 'en' ? `👥 ${name} asked to join your group` : `👥 ${name} xin vào nhóm của bạn`,
    body: g ? (lang === 'en' ? `${g}: open the group to accept or decline.` : `${g}: mở nhóm để chấp nhận hoặc từ chối.`) : (lang === 'en' ? 'Open the group to accept or decline.' : 'Mở nhóm để chấp nhận hoặc từ chối.'),
  }
}
