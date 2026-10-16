import { getRequestUser } from '@/lib/auth/getRequestUser'
import { AI } from '@/lib/ai/llm'
import { rateLimit } from '@/lib/security/rateLimit'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadAllowedUserIds } from '@/lib/ai/consent/aiDataConsent'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const groupId = params.id
  if (!groupId) return NextResponse.json({ error: 'missing_fields', message: serverMessage('validation.missingFields', requestLocale(req)) }, { status: 400 })

  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  // Per-user cap on this paid LLM call (creator-only, but still uncapped otherwise).
  if (!rateLimit(`group-suggest:${user.id}`, 5, 60_000).ok) {
    return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.tooFast', requestLocale(req)) }, { status: 429 })
  }

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, name, creator_id')
    .eq('id', groupId)
    .single()

  if (groupError || !group) return NextResponse.json({ error: 'group_not_found', message: serverMessage('group.notFound', requestLocale(req)) }, { status: 404 })
  if (group.creator_id !== user.id) return NextResponse.json({ error: 'owner_only', message: serverMessage('group.ownerOnly', requestLocale(req)) }, { status: 403 })

  const { data: members } = await supabase
    .from('group_members')
    .select('user_id, name, budget, food_preferences, dietary_restrictions, area')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })

  if (!members || members.length === 0) {
    return NextResponse.json({ error: 'no_members', message: serverMessage('group.noMembers', requestLocale(req)) }, { status: 400 })
  }

  // A member who uses an account on iOS is described only if THAT member agreed to the current AI disclosure (their own
  // record; the creator's agreement does not cover anyone else). Web-only accounts and guests (no account, user_id NULL)
  // have no iOS record and are described as before. An iOS member who has not agreed is counted but not described.
  // The lookup uses the admin client: the creator's own scope cannot read other people's consent rows. If the lookup
  // fails, no account is treated as allowed (fail closed).
  const admin = createAdminClient()
  const agreed = await loadAllowedUserIds(admin, members.map(m => m.user_id as string | null).filter((id): id is string => !!id))
  const described = members.filter(m => !m.user_id || agreed.has(m.user_id as string))
  const undescribed = members.length - described.length

  const memberLines = described.map(m => `- ${m.name}: ngân sách ${m.budget}, thích ${m.food_preferences || 'không rõ'}, kiêng ${m.dietary_restrictions || 'không có'}, khu vực ${m.area}`)
  if (undescribed > 0) memberLines.push(`- ${undescribed} thành viên khác chưa chia sẻ thông tin cá nhân (chỉ tính là số người).`)

  const prompt = `Nhóm "${group.name}" có ${members.length} người muốn đi ăn cùng nhau:
${memberLines.join('\n')}

Hãy gợi ý 3 địa điểm ăn uống phù hợp với TẤT CẢ mọi người, với lý do tại sao địa điểm đó phù hợp cho cả nhóm. Format đẹp, dễ đọc bằng tiếng Việt.`

  try {
    const { text: suggestion } = await AI.generate({
      role: 'smart',
      prompt,
      maxTokens: 1024,
    })

    await supabase
      .from('groups')
      .update({ suggestion })
      .eq('id', groupId)

    return NextResponse.json({ suggestion })
  } catch {
    return NextResponse.json({ error: 'suggest_failed', message: serverMessage('group.suggestFailed', requestLocale(req)) }, { status: 500 })
  }
}
