-- =============================================
-- TappyAI MVP - Supabase Schema
-- Chạy file này trong Supabase SQL Editor
-- =============================================

-- 1. Bảng profiles (thông tin user)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 2. Bảng conversations (lịch sử chat)
create table if not exists public.conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text default 'Cuộc trò chuyện mới',
  category text default 'general',
  messages jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists conversations_user_id_idx on public.conversations(user_id);
create index if not exists conversations_updated_at_idx on public.conversations(updated_at desc);

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "Users can manage own conversations" on public.conversations;
create policy "Users can manage own conversations" on public.conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or insert function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.profiles (id, email, full_name, avatar_url) values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url') on conflict (id) do update set email = excluded.email, full_name = coalesce(excluded.full_name, public.profiles.full_name), avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url), updated_at = now(); return new; end; $$;