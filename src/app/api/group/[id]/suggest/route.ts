import { getRequestUser } from '@/lib/auth/getRequestUser'
import { AI } from '@/lib/ai/llm'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const groupId = params.id
  if (!groupId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, name, creator_id')
    .eq('id', groupId)
    .single()

  if (groupError || !group) return NextResponse.json({ error: 'Không tìm thấy nhóm' }, { status: 404 })
  if (group.creator_id !== user.id) return NextResponse.json({ error: 'Chỉ trưởng nhóm mới có thể gợi ý' }, { status: 403 })

  const { data: members } = await supabase
    .from('group_members')
    .select('name, budget, food_preferences, dietary_restrictions, area')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })

  if (!members || members.length === 0) {
    return NextResponse.json({ error: 'Chưa có thành viên nào tham gia' }, { status: 400 })
  }

  const prompt = `Nhóm "${group.name}" có ${members.length} người muốn đi ăn cùng nhau:
${members.map(m => `- ${m.name}: ngân sách ${m.budget}, thích ${m.food_preferences || 'không rõ'}, kiêng ${m.dietary_restrictions || 'không có'}, khu vực ${m.area}`).join('\n')}

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
    return NextResponse.json({ error: 'Lỗi tạo gợi ý, vui lòng thử lại' }, { status: 500 })
  }
}
