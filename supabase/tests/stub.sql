-- Supabase 환경 흉내 — 빈 Postgres 에 Supabase 가 기본 제공하는 역할·스키마를 만든다 (테스트 전용)
-- 실제 Supabase 와 같은 이름·동작만 최소한으로: anon/authenticated/service_role 역할, auth.uid(), storage 테이블

-- 역할은 클러스터 전체에 하나 → 이미 있으면 건너뜀 (같은 서버에서 여러 번 실행 가능)
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
  alter role service_role bypassrls; -- Supabase 의 service_role 은 RLS 를 무시
end $$;

-- ── auth ──────────────────────────────────────
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);
-- 로그인한 사용자 id — Supabase 처럼 요청의 JWT sub 값을 읽음 (없으면 null = 비로그인·운영자)
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- ── storage ───────────────────────────────────
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets,
  name text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
-- 'a/b/c.jpg' → {a,b}
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

-- ── 권한 (Supabase 기본값과 같게: 테이블 권한은 열어 두고 RLS 로 막음) ──
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects, storage.buckets to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
