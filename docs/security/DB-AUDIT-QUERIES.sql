-- Kiểm tra bảo mật CSDL Supabase (audit 04/11, mục D-03, D-04, D-05). CHỈ ĐỌC: toàn bộ là SELECT trên danh mục hệ thống,
-- kết quả chỉ gồm TÊN (bảng, hàm, bucket, chính sách), không có dữ liệu người dùng. Chạy từng khối trong Supabase -> SQL Editor.
-- Kỳ vọng ghi ngay dưới mỗi khối; khối nào ra dòng ngoài kỳ vọng thì gửi kết quả để xử lý.

-- 1) Hàm SECURITY DEFINER trong public KHÔNG cố định search_path (kỳ vọng: 0 dòng)
select n.nspname as schema, p.proname as function
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef and n.nspname = 'public'
  and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
order by 1, 2;

-- 2) Bảng trong public chưa bật RLS (kỳ vọng: 0 dòng, hoặc chỉ bảng tham chiếu công khai có chủ đích)
select c.relname as table_without_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- 3) Bảng mà vai trò anon có quyền GHI (INSERT/UPDATE/DELETE/TRUNCATE) (kỳ vọng: 0 dòng)
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as anon_privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon' and privilege_type <> 'SELECT'
group by table_name order by 1;

-- 4) Bảng mà anon có quyền ĐỌC (kỳ vọng: chỉ bảng công khai có chủ đích, mỗi bảng đều có RLS ở khối 2)
select distinct table_name as anon_can_select
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon' and privilege_type = 'SELECT'
order by 1;

-- 5) View trong public không đặt security_invoker (kỳ vọng: 0 dòng; view mặc định chạy với quyền chủ sở hữu, bỏ qua RLS)
select c.relname as view_name, c.reloptions
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
  and (c.reloptions is null or not (c.reloptions::text ilike '%security_invoker=true%' or c.reloptions::text ilike '%security_invoker=on%'))
order by 1;

-- 6) Bucket Storage và chế độ công khai (cần cho D-03: ảnh người dùng nên ở bucket riêng tư + signed URL)
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by name;

-- 7) Chính sách trên storage.objects (D-04: hiện không có trong migration nên chỉ nhìn thấy ở đây)
select policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;

-- 8) Hàm trong public mà vai trò anon được EXECUTE (kỳ vọng: chỉ hàm công khai có chủ đích, như account_deletion_ready)
select p.proname as function, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE') and p.prokind = 'f'
order by 1;
