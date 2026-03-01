-- CV Pulse — Initial Schema
-- Epic 1.1: All core tables
-- Run in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────
-- ENUM: paid status
-- ─────────────────────────────────────────
create type paid_status as enum ('free', 'rolepulse_paid', 'paid_stripe');

-- ─────────────────────────────────────────
-- TABLE: users
-- Mirrors Supabase auth.users but with app-specific fields
-- ─────────────────────────────────────────
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  name          text,
  rolepulse_paid boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users can read own record"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update own record"
  on public.users for update
  using (auth.uid() = id);

-- ─────────────────────────────────────────
-- TABLE: cvs
-- One row per CV upload. Stores extracted text + structured JSON.
-- Original PDFs are never stored.
-- ─────────────────────────────────────────
create table public.cvs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  raw_text            text not null,
  structured_json     jsonb,
  parse_confidence    integer check (parse_confidence between 0 and 100),
  parse_fail_reason   text,
  target_role         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.cvs enable row level security;

create policy "Users can read own CVs"
  on public.cvs for select
  using (auth.uid() = user_id);

create policy "Users can insert own CVs"
  on public.cvs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own CVs"
  on public.cvs for update
  using (auth.uid() = user_id);

create policy "Users can delete own CVs"
  on public.cvs for delete
  using (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger cvs_updated_at
  before update on public.cvs
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────
-- TABLE: scores
-- One row per scoring run. Deterministic — same input = same output.
-- ─────────────────────────────────────────
create table public.scores (
  id                uuid primary key default gen_random_uuid(),
  cv_id             uuid not null references public.cvs(id) on delete cascade,
  overall_score     integer not null check (overall_score between 0 and 100),
  pass_fail         boolean not null,
  bucket_scores_json jsonb not null,  -- { proof_of_impact, ats_keywords, formatting, clarity }
  penalties_json    jsonb not null,   -- array of { code, reason }
  checklist_json    jsonb not null,   -- array of { id, done, action, why, example, points }
  created_at        timestamptz not null default now()
);

alter table public.scores enable row level security;

create policy "Users can read scores for own CVs"
  on public.scores for select
  using (
    exists (
      select 1 from public.cvs
      where cvs.id = scores.cv_id
      and cvs.user_id = auth.uid()
    )
  );

create policy "Users can insert scores for own CVs"
  on public.scores for insert
  with check (
    exists (
      select 1 from public.cvs
      where cvs.id = cv_id
      and cvs.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────
-- TABLE: jd_checks
-- One row per JD match check
-- ─────────────────────────────────────────
create table public.jd_checks (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id) on delete cascade,
  cv_id                 uuid references public.cvs(id) on delete set null,
  jd_text               text not null,
  match_score           integer check (match_score between 0 and 100),
  missing_keywords_json jsonb,
  created_at            timestamptz not null default now()
);

alter table public.jd_checks enable row level security;

create policy "Users can read own JD checks"
  on public.jd_checks for select
  using (auth.uid() = user_id);

create policy "Users can insert own JD checks"
  on public.jd_checks for insert
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- TABLE: usage
-- Tracks free credit usage per user
-- ─────────────────────────────────────────
create table public.usage (
  user_id               uuid primary key references public.users(id) on delete cascade,
  free_rescores_used    integer not null default 0,
  free_jd_checks_used   integer not null default 0,
  paid_status           paid_status not null default 'free',
  updated_at            timestamptz not null default now()
);

alter table public.usage enable row level security;

create policy "Users can read own usage"
  on public.usage for select
  using (auth.uid() = user_id);

create policy "Users can update own usage"
  on public.usage for update
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- TABLE: allowlist
-- RolePulse paid subscribers — bypass paywall
-- ─────────────────────────────────────────
create table public.allowlist (
  email       text primary key,
  added_at    timestamptz not null default now(),
  source      text  -- e.g. 'rolepulse_csv', 'manual'
);

alter table public.allowlist enable row level security;

-- No user-facing RLS — only read via service role (admin/server)
-- Users cannot read or write this table directly

-- ─────────────────────────────────────────
-- TABLE: events
-- Funnel analytics — no external service needed
-- ─────────────────────────────────────────
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  event_name  text not null,
  meta_json   jsonb,
  created_at  timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "Users can insert own events"
  on public.events for insert
  with check (auth.uid() = user_id or user_id is null);

-- Admin reads via service role only

-- ─────────────────────────────────────────
-- TABLE: share_links
-- Public redacted share links — no CV text, no contact info
-- ─────────────────────────────────────────
create table public.share_links (
  id                    uuid primary key default gen_random_uuid(),
  cv_id                 uuid not null references public.cvs(id) on delete cascade,
  share_token           text not null unique default encode(gen_random_bytes(12), 'hex'),
  redacted_summary_json jsonb not null,  -- { score, pass_fail, buckets, checklist_titles[] }
  created_at            timestamptz not null default now(),
  expires_at            timestamptz
);

alter table public.share_links enable row level security;

-- Public read — anyone with the token can read
create policy "Anyone can read share links"
  on public.share_links for select
  using (true);

create policy "Users can create share links for own CVs"
  on public.share_links for insert
  with check (
    exists (
      select 1 from public.cvs
      where cvs.id = cv_id
      and cvs.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────
-- FUNCTION: handle new user
-- Creates user record + usage record on first sign-in
-- Checks allowlist for RolePulse paid status
-- ─────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
declare
  is_rolepulse_paid boolean;
begin
  -- Check if email is in allowlist
  select exists(
    select 1 from public.allowlist where email = new.email
  ) into is_rolepulse_paid;

  -- Insert user record
  insert into public.users (id, email, name, rolepulse_paid)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    is_rolepulse_paid
  );

  -- Insert usage record
  insert into public.usage (user_id, paid_status)
  values (
    new.id,
    case when is_rolepulse_paid then 'rolepulse_paid'::paid_status else 'free'::paid_status end
  );

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
