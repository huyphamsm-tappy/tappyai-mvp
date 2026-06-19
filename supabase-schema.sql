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

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.profiles (id, email, full_name, avatar_url) values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url') on conflict (id) do update set email = excluded.email, full_name = coalesce(excluded.full_name, public.profiles.full_name), avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url), updated_at = now(); return new; end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- =============================================
-- MIGRATION: Thêm cột onboarded + stripe_customer_id vào profiles
-- =============================================
alter table public.profiles
  add column if not exists onboarded boolean default false,
  add column if not exists stripe_customer_id text;

-- =============================================
-- 3. Bảng subscriptions (Stripe)
-- =============================================
create table if not exists public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null unique,
  stripe_subscription_id text,
  stripe_customer_id text,
  status text not null default 'inactive', -- active | canceled | past_due | inactive
  price_id text,
  current_period_end timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
create index if not exists subscriptions_status_idx on public.subscriptions(status);

alter table public.subscriptions enable row level security;

drop policy if exists "Users can view own subscription" on public.subscriptions;
create policy "Users can view own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Service role bypasses RLS, so webhook can write without policy

-- =============================================
-- 4. Bảng user_memory (AI memory)
-- =============================================
create table if not exists public.user_memory (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null unique,
  location_base text,
  preferences jsonb default '{}'::jsonb,
  bookmarks jsonb default '[]'::jsonb,
  recent_searches jsonb default '[]'::jsonb,
  custom_facts jsonb default '[]'::jsonb,
  updated_at timestamp with time zone default now()
);

alter table public.user_memory enable row level security;

drop policy if exists "Users can manage own memory" on public.user_memory;
create policy "Users can manage own memory" on public.user_memory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);