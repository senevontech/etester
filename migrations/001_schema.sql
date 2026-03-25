-- ============================================================
-- Etester Multi-Org Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ─── Extensions ─────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Profiles ────────────────────────────────────────────────
-- Mirrors auth.users with name + email for easy joins
create table if not exists public.profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    name        text not null,
    email       text not null,
    created_at  timestamptz default now()
);
alter table public.profiles enable row level security;

create policy "Users can view all profiles"
    on public.profiles for select using (true);
create policy "Users can insert their own profile"
    on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile"
    on public.profiles for update using (auth.uid() = id);

-- ─── Organizations ────────────────────────────────────────────
create table if not exists public.organizations (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    slug        text unique not null,
    invite_code text unique not null default substr(md5(random()::text || now()::text), 1, 8),
    created_by  uuid references auth.users(id) on delete set null,
    created_at  timestamptz default now()
);
alter table public.organizations enable row level security;

-- Anyone who is a member can view the org
create policy "Members can view their org"
    on public.organizations for select
    using (
        auth.uid() in (
            select user_id from public.org_members where org_id = organizations.id
        )
    );
create policy "Authenticated users can create orgs"
    on public.organizations for insert
    with check (auth.uid() = created_by);
create policy "Org admins can update org"
    on public.organizations for update
    using (
        auth.uid() in (
            select user_id from public.org_members
            where org_id = organizations.id and role = 'admin'
        )
    );

-- ─── Org Members ─────────────────────────────────────────────
create table if not exists public.org_members (
    id          uuid primary key default gen_random_uuid(),
    org_id      uuid not null references public.organizations(id) on delete cascade,
    user_id     uuid not null references auth.users(id) on delete cascade,
    role        text not null check (role in ('admin', 'student')),
    joined_at   timestamptz default now(),
    unique(org_id, user_id)
);
alter table public.org_members enable row level security;

-- Members can see all members of their org
create policy "Members can view org members"
    on public.org_members for select
    using (
        auth.uid() in (
            select user_id from public.org_members om2 where om2.org_id = org_members.org_id
        )
    );
-- Users can join an org themselves (via invite code flow handled in app)
create policy "Users can insert their own membership"
    on public.org_members for insert
    with check (auth.uid() = user_id);
-- Admins can add/remove members
create policy "Admins can manage org members"
    on public.org_members for delete
    using (
        auth.uid() in (
            select user_id from public.org_members where org_id = org_members.org_id and role = 'admin'
        )
    );

-- ─── Tests ────────────────────────────────────────────────────
create table if not exists public.tests (
    id          uuid primary key default gen_random_uuid(),
    org_id      uuid not null references public.organizations(id) on delete cascade,
    title       text not null,
    description text default '',
    duration    int not null default 60,
    difficulty  text not null check (difficulty in ('Easy', 'Medium', 'Hard')) default 'Medium',
    tags        text[] not null default '{}',
    published   boolean not null default false,
    created_by  uuid references auth.users(id) on delete set null,
    created_at  timestamptz default now()
);
alter table public.tests enable row level security;

-- Org members can read tests
create policy "Org members can view tests"
    on public.tests for select
    using (
        auth.uid() in (
            select user_id from public.org_members where org_id = tests.org_id
        )
    );
-- Org admins can insert/update/delete tests
create policy "Org admins can manage tests"
    on public.tests for all
    using (
        auth.uid() in (
            select user_id from public.org_members
            where org_id = tests.org_id and role = 'admin'
        )
    );

-- ─── Questions ────────────────────────────────────────────────
create table if not exists public.questions (
    id          uuid primary key default gen_random_uuid(),
    test_id     uuid not null references public.tests(id) on delete cascade,
    type        text not null check (type in ('mcq', 'code', 'text', 'numeric')),
    category    text not null default 'mcq',
    title       text not null,
    description text default '',
    image_url   text,
    points      int not null default 10,
    position    int not null default 0,
    -- MCQ
    options     text[] default '{}',
    answer      int,
    -- Short answer / numerical
    accepted_answers text[] default '{}',
    case_sensitive boolean not null default false,
    numeric_answer double precision,
    numeric_tolerance double precision not null default 0,
    -- Code
    template    text,
    language    text,
    constraints text[] default '{}',
    examples    jsonb default '[]',
    created_at  timestamptz default now()
);
alter table public.questions enable row level security;

-- Org members can read questions of their org's tests
create policy "Org members can view questions"
    on public.questions for select
    using (
        auth.uid() in (
            select om.user_id from public.org_members om
            inner join public.tests t on t.org_id = om.org_id
            where t.id = questions.test_id
        )
    );
-- Org admins can manage questions
create policy "Org admins can manage questions"
    on public.questions for all
    using (
        auth.uid() in (
            select om.user_id from public.org_members om
            inner join public.tests t on t.org_id = om.org_id
            where t.id = questions.test_id and om.role = 'admin'
        )
    );

-- ─── Submissions ──────────────────────────────────────────────
create table if not exists public.submissions (
    id               uuid primary key default gen_random_uuid(),
    test_id          uuid not null references public.tests(id) on delete cascade,
    org_id           uuid not null references public.organizations(id) on delete cascade,
    student_id       uuid not null references auth.users(id) on delete cascade,
    student_name     text not null,
    answers          jsonb not null default '[]',
    score            int not null default 0,
    total_points     int not null default 0,
    integrity_score  int not null default 100,
    violations_count int not null default 0,
    submitted_at     timestamptz default now()
);
alter table public.submissions enable row level security;

-- Students see only their own
create policy "Students can view own submissions"
    on public.submissions for select
    using (auth.uid() = student_id);
-- Admins see all submissions for their org
create policy "Org admins can view all submissions"
    on public.submissions for select
    using (
        auth.uid() in (
            select user_id from public.org_members
            where org_id = submissions.org_id and role = 'admin'
        )
    );
-- Students can submit
create policy "Students can submit"
    on public.submissions for insert
    with check (auth.uid() = student_id);

-- ─── Helper Function: get_org_by_invite_code ─────────────────
-- Used to look up an org by its invite code before joining
create or replace function public.get_org_by_invite_code(code text)
returns table(id uuid, name text, slug text)
language sql security definer
as $$
    select id, name, slug from public.organizations where invite_code = code;
$$;

-- ─── Trigger: Auto-create profile on signup ───────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
    insert into public.profiles(id, name, email)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.email
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
