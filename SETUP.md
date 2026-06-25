# TappyAI MVP — Hướng dẫn Setup & Deploy

## Bước 1: Tạo GitHub repo mới

```bash
# Vào thư mục tappyai-mvp
cd tappyai-mvp

# Init git
git init
git add .
git commit -m "feat: TappyAI MVP initial commit"

# Tạo repo mới trên github.com, sau đó:
git remote add origin https://github.com/YOUR_USERNAME/tappyai-mvp.git
git push -u origin main
```

---

## Bước 2: Setup Supabase

1. Vào **https://supabase.com/dashboard** → chọn project `fwznnobrdctuskgrvuik`
2. Vào **SQL Editor** → paste toàn bộ nội dung file `supabase-schema.sql` → Run
3. Kiểm tra **Table Editor** thấy 2 bảng: `profiles` và `conversations` ✅

**Lấy credentials:**
- Vào **Settings → API**
- Copy `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- Copy `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Google OAuth (đã setup ở project cũ, dùng lại):**
- Vào **Authentication → Providers → Google** → đảm bảo đang bật
- Vào **Authentication → URL Configuration**:
   - Site URL: `https://tappyai-mvp.vercel.app` (sƽ có sau khi deploy)
   - Redirect URLs: thêm `https://tappyai-mvp.vercel.app/**`
