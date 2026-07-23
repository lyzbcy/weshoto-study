-- ============================================================
-- weshoto-study · Supabase 数据库结构
-- 用法：登录 Supabase → 选中你的项目 → 左侧 SQL Editor → New query
--      → 把本文件全部内容粘进去 → 点 Run
-- 可重复执行（用了 CREATE OR REPLACE / IF NOT EXISTS，不会重复建错）
-- ============================================================


-- ---------- 1. profiles 表：用户昵称 ----------
-- 注册时由下方触发器自动写入，前端不直接 insert/update 这张表
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 所有人可读昵称（评论列表要显示「谁说的」）
drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all" on public.profiles
  for select using (true);

-- 用户只能插自己的 profile（触发器会插，这是兜底）
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);

-- 用户只能改自己
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);


-- ---------- 2. comments 表：划选文字评论 ----------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  page        text not null,           -- 章节，如 "chapter3"
  section_id  text not null,           -- 锚点元素 id，如 "sec4"
  quote       text,                    -- 用户选中的原文（展示 + 重新定位用）
  content     text not null,           -- 评论正文
  user_id     uuid not null references auth.users(id) on delete cascade,
  username    text not null,           -- 冗余昵称（免得每次都 join profiles）
  created_at  timestamptz not null default now()
);

-- 查询用索引：按页查 + 按时间倒序
create index if not exists idx_comments_page on public.comments(page);
create index if not exists idx_comments_created on public.comments(created_at desc);

alter table public.comments enable row level security;

-- 所有人可读（匿名也能看评论）
drop policy if exists "comments_read_all" on public.comments;
create policy "comments_read_all" on public.comments
  for select using (true);

-- 仅登录用户可写，且 user_id 必须是自己
drop policy if exists "comments_insert_self" on public.comments;
create policy "comments_insert_self" on public.comments
  for insert with check (auth.uid() = user_id);

-- 只能删自己的评论
drop policy if exists "comments_delete_self" on public.comments;
create policy "comments_delete_self" on public.comments
  for delete using (auth.uid() = user_id);


-- ---------- 3. 注册触发器：新建 auth 用户 → 自动建 profile ----------
-- 触发器只做兜底：存 email 的 @ 前部分（可能是 URL 编码的中文，如 %E6%B3%BD%E6%81%A9）。
-- 真实的中文显示名由前端在注册成功后直接 upsert 到 profiles.username（见 auth.js ensureProfile），
-- 这样 profiles.username 始终是可读的原始用户名，不依赖 SQL 端做 URL 解码。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ---------- 4. 开启 comments 实时推送 ----------
-- 让前端能订阅到别人发的新评论（划选评论面板实时刷新）
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;
