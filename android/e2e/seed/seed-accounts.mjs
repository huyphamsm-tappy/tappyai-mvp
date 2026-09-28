// Seeds the e2e accounts and their content on the AUDIT project (zdaprdfgpbpnxyofagmc).
// Idempotent: accounts are created once; the [E2E] posts/shares/saves are rebuilt on every run.
// Only touches rows of the accounts it created (R11: never the pre-existing manual.uat.* rows).
//
//   node android/e2e/seed/seed-accounts.mjs
import { rest, ensureUser } from '../lib/supabase.mjs'

export const ACCOUNTS = {
  pro: { email: 'e2e.android.pro@example.com', name: 'E2E Pro (chính chủ)' },
  free: { email: 'e2e.android.free@example.com', name: 'E2E Free' },
  other: { email: 'e2e.android.other@example.com', name: 'E2E Người khác' },
  nodob: { email: 'e2e.android.nodob@example.com', name: 'E2E Chưa khai tuổi' },
}

const TAG = '[E2E]'

async function media() {
  // Reuse media the audit project already serves (seed photos, a real uploaded clip, a YouTube
  // link) so no upload is needed — uploads are unavailable on UAT (GCP WIF, see ANDROID-REQUESTS).
  const photos = await rest.get("reviews?select=photos&place_id=in.(community_uat_seed_pho-bo,community_uat_seed_banh-mi,community_uat_seed_ca-phe-muoi)&limit=3")
  const clip = (await rest.get('reviews?select=media_url,thumbnail&id=eq.8d959f57-3f60-48f9-966a-d769c2185bbb'))[0]
  return { photos: photos.map((p) => p.photos[0]).filter(Boolean), clip }
}

function post(userId, key, fields) {
  return {
    user_id: userId, place_id: `e2e_${key}`, place_name: fields.place_name, place_address: 'Quận 1, TP.HCM',
    is_hidden: false, publication_state: 'PUBLISHED', content_type: 'photo',
    source_type: 'upload', source_url: null, rating: 5, ...fields, body: `${TAG} ${fields.body}`,
  }
}

export async function seed() {
  const u = {}
  for (const [role, a] of Object.entries(ACCOUNTS)) u[role] = await ensureUser(a.email, a.name)

  for (const [role, a] of Object.entries(ACCOUNTS)) {
    await rest.patch(`profiles?id=eq.${u[role].id}`, { full_name: a.name, onboarded: true, language: 'vi' })
    if (role !== 'nodob') {
      await rest.upsert('user_demographics', [{ user_id: u[role].id, date_of_birth: '1994-06-15', age_declared_at: new Date().toISOString() }], 'user_id')
    }
  }
  const sub = await rest.get(`subscriptions?select=id&user_id=eq.${u.pro.id}`)
  if (!sub.length) {
    await rest.insert('subscriptions', [{ user_id: u.pro.id, plan: 'pro', status: 'active', current_period_end: new Date(Date.now() + 365 * 864e5).toISOString() }])
  }

  // Rebuild the tagged content.
  const ids = [u.pro.id, u.other.id].join(',')
  await rest.del(`review_shares?user_id=in.(${ids})`)
  await rest.del(`review_saves?user_id=in.(${ids})`)
  await rest.del(`reviews?user_id=in.(${ids})&place_id=like.e2e_*`)

  const m = await media()
  const P = (i) => [m.photos[i % m.photos.length]]
  const [o1, o2, o3, o4, o5] = await rest.insert('reviews', [
    post(u.other.id, 'other_photo1', { place_name: 'Phở Người Khác (E2E)', body: 'bài công khai 1', photos: P(0), media_url: P(0)[0], thumbnail: P(0)[0] }),
    post(u.other.id, 'other_photo2', { place_name: 'Bánh Mì Người Khác (E2E)', body: 'bài công khai 2', photos: P(1), media_url: P(1)[0], thumbnail: P(1)[0] }),
    post(u.other.id, 'other_clip', { place_name: 'Clip Người Khác (E2E)', body: 'clip công khai', content_type: 'video', media_url: m.clip.media_url, thumbnail: m.clip.thumbnail, photos: [] }),
    post(u.other.id, 'other_hidden', { place_name: 'Bài Ẩn Người Khác (E2E)', body: 'bài ẩn — người xem KHÔNG được thấy', is_hidden: true, photos: P(2), media_url: P(2)[0], thumbnail: P(2)[0] }),
    // A share-only row (no real place, the web's `isShareOnlyName`) — what the visitor "Chia sẻ" tab lists.
    post(u.other.id, 'other_share', { place_name: 'Chia sẻ', body: 'link YouTube chia sẻ', content_type: 'video', source_type: 'youtube', source_url: 'https://www.youtube.com/watch?v=ftsQYS1fkOs', media_url: 'https://www.youtube.com/watch?v=ftsQYS1fkOs', thumbnail: 'https://i.ytimg.com/vi/ftsQYS1fkOs/hqdefault.jpg', photos: [], rating: null }),
  ])
  // Pro follows the other account, so its profile is reachable from Tôi → Đang theo dõi.
  await rest.del(`user_follows?follower_id=eq.${u.pro.id}`)
  await rest.insert('user_follows', [{ follower_id: u.pro.id, following_id: u.other.id }])
  const [p1, p2, p3, p4] = await rest.insert('reviews', [
    post(u.pro.id, 'pro_published1', { place_name: 'Phở Chính Chủ (E2E)', body: 'đã đăng 1', photos: P(0), media_url: P(0)[0], thumbnail: P(0)[0] }),
    post(u.pro.id, 'pro_published2', { place_name: 'Cà Phê Chính Chủ (E2E)', body: 'đã đăng 2', photos: P(2), media_url: P(2)[0], thumbnail: P(2)[0] }),
    post(u.pro.id, 'pro_restricted', { place_name: 'Bài Bị Hạn Chế (E2E)', body: 'bị hạn chế', publication_state: 'RESTRICTED', photos: P(1), media_url: P(1)[0], thumbnail: P(1)[0] }),
    post(u.pro.id, 'pro_hidden', { place_name: 'Bài Đã Ẩn (E2E)', body: 'đã ẩn', is_hidden: true, photos: P(0), media_url: P(0)[0], thumbnail: P(0)[0] }),
  ])
  await rest.insert('review_shares', [
    { review_id: o1.id, user_id: u.other.id, channel: 'zalo' },
    { review_id: o3.id, user_id: u.other.id, channel: 'facebook' },
    { review_id: p1.id, user_id: u.pro.id, channel: 'zalo' },
    { review_id: o2.id, user_id: u.pro.id, channel: 'copy' },
  ])
  await rest.insert('review_saves', [
    { review_id: o1.id, user_id: u.pro.id },
    { review_id: o3.id, user_id: u.pro.id },
  ])
  return {
    users: Object.fromEntries(Object.entries(u).map(([k, v]) => [k, { email: v.email, id: v.id }])),
    other: { public: [o1.id, o2.id, o3.id], hidden: o4.id, share: o5.id },
    pro: { published: [p1.id, p2.id], restricted: p3.id, hidden: p4.id, shared: [p1.id, o2.id], saved: [o1.id, o3.id] },
  }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const s = await seed()
  console.log(JSON.stringify(s, null, 2))
}
