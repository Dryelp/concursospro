create table if not exists public.mock_simulations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.exam_projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  status text not null default 'not_started'
    check (status in ('generating', 'not_started', 'in_progress', 'completed', 'failed')),
  total_questions integer not null default 0 check (total_questions >= 0),
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  exam_format text not null default 'unknown',
  distribution jsonb not null default '[]'::jsonb,
  score numeric,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mock_questions
  add column if not exists simulation_id uuid references public.mock_simulations(id) on delete cascade;

create index if not exists mock_simulations_user_project_idx
  on public.mock_simulations (user_id, project_id, created_at desc);

create index if not exists mock_questions_simulation_idx
  on public.mock_questions (simulation_id, created_at);

create index if not exists mock_questions_user_project_loose_pending_idx
  on public.mock_questions (user_id, project_id, created_at desc)
  where answered_at is null and simulation_id is null;

grant select, insert, update, delete on public.mock_simulations to authenticated;
grant select, insert, update, delete on public.mock_questions to authenticated;

alter table public.mock_simulations enable row level security;

drop policy if exists "mock_simulations_select_own" on public.mock_simulations;
create policy "mock_simulations_select_own"
on public.mock_simulations
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "mock_simulations_insert_own" on public.mock_simulations;
create policy "mock_simulations_insert_own"
on public.mock_simulations
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "mock_simulations_update_own" on public.mock_simulations;
create policy "mock_simulations_update_own"
on public.mock_simulations
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "mock_simulations_delete_own" on public.mock_simulations;
create policy "mock_simulations_delete_own"
on public.mock_simulations
for delete
to authenticated
using ((select auth.uid()) = user_id);
