# TappyAI — Danh sách công việc

> **Cách dùng:** Mỗi khi muốn Claude Code làm việc, mở Terminal tại thư mục project và chạy `claude`, sau đó paste prompt bên dưới:
> 
> **Prompt mẫu:** *"Đọc file TASKS.md và thực hiện tất cả task có trạng thái TODO theo thứ tự. Sau mỗi task xong thì đổi trạng thái thành DONE và commit code."*

---

## 🐛 BUG FIX

### [DONE] BUG-001: Shift+Enter không xuống dòng trong chat
- **File:** `src/components/ChatInterface.tsx`
- **Fix đã làm:** Đổi `<input type="text">` → `<textarea>` với auto-resize, cập nhật TypeScript types, Enter=submit, Shift+Enter=xuống dòng

### [DONE] BUG-002: Giới hạn scope AI chỉ trả lời 5 lĩnh vực
- **File:** `src/app/api/chat/route.ts`
- **Trạng thái:** `scopeBlock` đã có sẵn trong `buildSystem()` từ trước — không cần fix thêm

---

## ✨ TÍNH NĂNG MỚI

*(Bạn thêm vào đây khi cần)*

### [TODO] FEAT-001: _(mô tả tính năng)_
- **Mục tiêu:** 
- **Files liên quan:** 
- **Chi tiết:**

---

## ✅ ĐÃ HOÀN THÀNH

*(Tasks chuyển xuống đây sau khi DONE)*

---

## 📋 GHI CHÚ KỸ THUẬT

- Stack: Next.js 14, TypeScript, Tailwind CSS, Supabase, Claude API
- Deploy: Vercel (auto-deploy khi push lên `main`)
- Sau khi fix xong: `git add . && git commit -m "fix: mô tả" && git push origin main`
- Vercel sẽ tự deploy sau ~1-2 phút
