create extension if not exists "pgcrypto";

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null,
    email text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    invite_code text not null unique default substr(md5(random()::text || now()::text), 1, 8),
    invite_code_expiry timestamptz,
    invite_code_max_usage integer,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists public.org_members (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('admin', 'student')),
    joined_at timestamptz not null default now(),
    unique (org_id, user_id)
);

create table if not exists public.groups (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    name text not null,
    description text not null default '',
    created_at timestamptz not null default now()
);

create table if not exists public.group_members (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    joined_at timestamptz not null default now(),
    unique (group_id, user_id)
);

create table if not exists public.tests (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    title text not null,
    description text not null default '',
    duration integer not null default 60,
    difficulty text not null check (difficulty in ('Easy', 'Medium', 'Hard')) default 'Medium',
    tags text[] not null default '{}',
    visibility text not null default 'assigned_only' check (visibility in ('assigned_only', 'org_public')),
    published boolean not null default false,
    start_at timestamptz,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists public.questions (
    id uuid primary key default gen_random_uuid(),
    test_id uuid not null references public.tests(id) on delete cascade,
    type text not null check (type in ('mcq', 'code', 'text', 'numeric')),
    category text not null default 'mcq',
    title text not null,
    description text not null default '',
    image_url text,
    points integer not null default 0,
    position integer not null default 0,
    options jsonb,
    answer integer,
    accepted_answers jsonb,
    case_sensitive boolean not null default false,
    numeric_answer double precision,
    numeric_tolerance double precision not null default 0,
    template text,
    language text,
    constraints jsonb,
    examples jsonb,
    test_cases jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.test_assignments (
    id uuid primary key default gen_random_uuid(),
    test_id uuid not null references public.tests(id) on delete cascade,
    student_id uuid references auth.users(id) on delete cascade,
    group_id uuid references public.groups(id) on delete cascade,
    assigned_at timestamptz not null default now(),
    check ((student_id is not null and group_id is null) or (student_id is null and group_id is not null))
);

create table if not exists public.test_attempts (
    id uuid primary key default gen_random_uuid(),
    test_id uuid not null references public.tests(id) on delete cascade,
    org_id uuid not null references public.organizations(id) on delete cascade,
    student_id uuid not null references auth.users(id) on delete cascade,
    status text not null check (status in ('active', 'submitted', 'expired', 'abandoned', 'in_progress', 'completed')),
    answers jsonb not null default '[]'::jsonb,
    started_at timestamptz not null default now(),
    last_heartbeat_at timestamptz not null default now(),
    expires_at timestamptz not null,
    submitted_at timestamptz,
    violations_count integer not null default 0,
    violation_score integer default 0,
    integrity_events jsonb not null default '[]'::jsonb,
    ip_address text,
    user_agent text
);

create table if not exists public.attempt_logs (
    id uuid primary key default gen_random_uuid(),
    attempt_id uuid not null references public.test_attempts(id) on delete cascade,
    event_type text not null,
    details jsonb not null default '{}'::jsonb,
    timestamp timestamptz not null default now()
);

create table if not exists public.attempt_evidence (
    id uuid primary key default gen_random_uuid(),
    attempt_id uuid not null references public.test_attempts(id) on delete cascade,
    kind text not null check (kind in ('webcam_snapshot')),
    mime_type text not null,
    image_data text not null,
    byte_size integer not null,
    sha256 text not null,
    metadata jsonb not null default '{}'::jsonb,
    captured_at timestamptz not null,
    created_at timestamptz not null default now()
);

create table if not exists public.submissions (
    id uuid primary key default gen_random_uuid(),
    test_id uuid not null references public.tests(id) on delete cascade,
    org_id uuid not null references public.organizations(id) on delete cascade,
    student_id uuid not null references auth.users(id) on delete cascade,
    student_name text not null,
    attempt_id uuid unique,
    answers jsonb not null default '[]'::jsonb,
    score integer not null default 0,
    total_points integer not null default 0,
    integrity_score integer not null default 100,
    violations_count integer not null default 0,
    integrity_events jsonb not null default '[]'::jsonb,
    submitted_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    org_id uuid references public.organizations(id) on delete cascade,
    actor_user_id uuid references auth.users(id) on delete set null,
    action text not null,
    entity_type text not null,
    entity_id uuid,
    metadata jsonb not null default '{}'::jsonb,
    ip_address text,
    created_at timestamptz not null default now()
);

create index if not exists idx_org_members_user_id on public.org_members(user_id);
create index if not exists idx_org_members_org_id on public.org_members(org_id);
create index if not exists idx_groups_org_id on public.groups(org_id);
create index if not exists idx_group_members_group_id on public.group_members(group_id);
create index if not exists idx_group_members_user_id on public.group_members(user_id);
create index if not exists idx_tests_org_id on public.tests(org_id);
create index if not exists idx_questions_test_id on public.questions(test_id);
create index if not exists idx_test_assignments_test_id on public.test_assignments(test_id);
create index if not exists idx_test_attempts_test_student on public.test_attempts(test_id, student_id);
create index if not exists idx_attempt_logs_attempt_id on public.attempt_logs(attempt_id);
create index if not exists idx_attempt_evidence_attempt_id on public.attempt_evidence(attempt_id);
create index if not exists idx_submissions_org_id on public.submissions(org_id);
create index if not exists idx_audit_logs_org_id on public.audit_logs(org_id);

create unique index if not exists idx_test_attempts_active_unique on public.test_attempts (test_id, student_id) where status in ('active', 'in_progress');
create unique index if not exists idx_submissions_attempt_id_unique on public.submissions (attempt_id) where attempt_id is not null;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.tests enable row level security;
alter table public.questions enable row level security;
alter table public.test_assignments enable row level security;
alter table public.test_attempts enable row level security;
alter table public.attempt_logs enable row level security;
alter table public.attempt_evidence enable row level security;
alter table public.submissions enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "authenticated_profiles" on public.profiles;
drop policy if exists "authenticated_orgs" on public.organizations;
drop policy if exists "authenticated_org_members" on public.org_members;
drop policy if exists "authenticated_groups" on public.groups;
drop policy if exists "authenticated_group_members" on public.group_members;
drop policy if exists "authenticated_tests" on public.tests;
drop policy if exists "authenticated_questions" on public.questions;
drop policy if exists "authenticated_test_assignments" on public.test_assignments;
drop policy if exists "authenticated_test_attempts" on public.test_attempts;
drop policy if exists "authenticated_attempt_logs" on public.attempt_logs;
drop policy if exists "authenticated_attempt_evidence" on public.attempt_evidence;
drop policy if exists "authenticated_submissions" on public.submissions;
drop policy if exists "authenticated_audit_logs" on public.audit_logs;

create policy "authenticated_profiles" on public.profiles for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_orgs" on public.organizations for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_org_members" on public.org_members for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_groups" on public.groups for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_group_members" on public.group_members for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_tests" on public.tests for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_questions" on public.questions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_test_assignments" on public.test_assignments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_test_attempts" on public.test_attempts for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_attempt_logs" on public.attempt_logs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_attempt_evidence" on public.attempt_evidence for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_submissions" on public.submissions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_audit_logs" on public.audit_logs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, name, email)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.email
    )
    on conflict (id) do update
    set
        name = excluded.name,
        email = excluded.email;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
