/**
 * Supabase 云端配置
 *
 * 在 https://supabase.com 免费创建项目后，把下面两个值替换为你的项目凭证：
 *   1. Project URL      （Settings → API → Project URL）
 *   2. anon public key  （Settings → API → anon public）
 *
 * 然后在 Supabase 控制台 SQL Editor 执行（建两张表 + RLS）：
 * ---------------------------------------------------------------
 * create table if not exists public.ext_users (
 *   username text primary key,
 *   salt text not null default '',
 *   hash text not null default '',
 *   email text,
 *   provider text not null default 'local',
 *   created_at bigint not null default 0
 * );
 *
 * create table if not exists public.ext_saves (
 *   id text primary key,
 *   username text not null,
 *   name text not null default '',
 *   updated_at bigint not null default 0,
 *   data jsonb not null default '{}'::jsonb
 * );
 * create index if not exists ext_saves_user_idx on public.ext_saves (username);
 *
 * -- 好友 / 关注关系表（关注 = follower 关注 followee 一条记录；
 * -- 互相关注 = 同时存在 A→B 与 B→A，即"好友"）
 * create table if not exists public.ext_friends (
 *   follower text not null,
 *   followee text not null,
 *   created_at bigint not null default 0,
 *   primary key (follower, followee)
 * );
 * create index if not exists ext_friends_follower_idx on public.ext_friends (follower);
 * create index if not exists ext_friends_followee_idx on public.ext_friends (followee);
 *
 * alter table public.ext_users enable row level security;
 * alter table public.ext_saves enable row level security;
 * alter table public.ext_friends enable row level security;
 * create policy "ext_users all" on public.ext_users for all using (true);
 * create policy "ext_saves all" on public.ext_saves for all using (true);
 * create policy "ext_friends all" on public.ext_friends for all using (true);
 *
 * ---------------------------------------------------------------
 * 社区扩展表（2026-10 新增）
 * ---------------------------------------------------------------
 * 存整个项目快照，这样「一键载入」能真正还原积木定义与画布实现；
 * generated_code 一并存着，浏览页可以给不装编辑器的人看源码。
 *
 * create table if not exists public.ext_community (
 *   id text primary key,                       -- ext_<作者>_<时间戳>
 *   author text not null default '',
 *   name text not null default '',
 *   description text not null default '',
 *   ext_info jsonb not null default '{}'::jsonb,   -- 扩展元信息
 *   custom_blocks jsonb not null default '[]'::jsonb, -- 积木定义
 *   workspace_xml jsonb not null default '{}'::jsonb,  -- 画布实现
 *   generated_code text not null default '',         -- 生成的扩展源码
 *   views_count bigint not null default 0,
 *   likes_count bigint not null default 0,
 *   created_at bigint not null default 0,
 *   updated_at bigint not null default 0
 * );
 * create index if not exists ext_community_updated_idx
 *   on public.ext_community (updated_at desc);
 * create index if not exists ext_community_author_idx
 *   on public.ext_community (author);
 *
 * alter table public.ext_community enable row level security;
 * create policy "ext_community read" on public.ext_community
 *   for select using (true);
 * -- 写入/删除不限作者：社区是公开分享性质，且当前用 anon key
 * -- （没有真正的登录态可做 RLS 归属判断）。若将来接入真实鉴权，
 * -- 应收紧为 using (author = <当前用户>)。
 * create policy "ext_community write" on public.ext_community
 *   for insert with check (true);
 * create policy "ext_community update" on public.ext_community
 *   for update using (true);
 * create policy "ext_community delete" on public.ext_community
 *   for delete using (true);
 *
 * 浏览量自增函数（可选；没有它时统计静默失败，不影响功能）
 * create or replace function public.bump_community_views(rid text)
 * returns void language sql security definer as $$
 *   update public.ext_community set views_count = views_count + 1 where id = rid;
 * $$;
 *
 * ---------------------------------------------------------------
 */

// Supabase 项目凭证。
// 2026-10：原项目 hbndheyywwinwezoekyd 的域名已 NXDOMAIN（项目被回收），
// 下面的 URL/KEY 是占位值 —— 换新项目后把这两行替换掉即可，其余代码
// 无需改动。替换后在 Supabase SQL Editor 执行上面注释里的建表语句。
export const SUPABASE_URL = 'https://hbndheyywwinwezoekyd.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibmRoZXl5d3dpbndlem9la3lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NDE0MzMsImV4cCI6MjEwMDExNzQzM30.V01oah5J16cfB0GpfCxueERo5dGczFI-OzVQCvWeoMY';

/** 云端同步是否开启 */
export const CLOUD_ENABLED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
