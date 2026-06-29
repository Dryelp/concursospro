create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  tipo text,
  wpp text,
  meta numeric default 0,
  segmento text default 'geral',
  meus_srvs jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  modulos jsonb default '{}'::jsonb,
  cnpj text,
  end_perfil text,
  plano text default 'free' check (plano = any (array['free', 'pro'])),
  plano_expira timestamptz,
  asaas_customer_id text,
  asaas_subscription_id text,
  onboarding_completo boolean default false,
  logo_url text
);

alter table public.profiles
  add column if not exists hours_per_week integer not null default 12,
  add column if not exists study_days integer[] not null default array[1,2,3,4,5],
  add column if not exists focus_mode text not null default 'balanced',
  add column if not exists exam_stage text not null default 'building',
  add column if not exists study_goal text,
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_concurseiro_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
    set nome = coalesce(public.profiles.nome, excluded.nome),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_concurseiro on auth.users;

create trigger on_auth_user_created_concurseiro
after insert on auth.users
for each row execute procedure public.handle_concurseiro_profile();

revoke execute on function public.handle_concurseiro_profile() from public;
revoke execute on function public.handle_concurseiro_profile() from anon;
revoke execute on function public.handle_concurseiro_profile() from authenticated;

create table if not exists public.exam_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  organization text,
  board text,
  position_name text,
  exam_date date,
  source_type text not null default 'plain-text' check (source_type in ('pdf-textual', 'pdf-scan', 'image', 'plain-text')),
  status text not null default 'draft' check (status in ('draft', 'processing', 'ready', 'archived')),
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'processing', 'review', 'ready', 'failed')),
  progress numeric(5,2) not null default 0,
  study_hours_per_week integer not null default 12,
  study_days integer[] not null default array[1,2,3,4,5],
  focus_subject text,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.exam_projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  weight numeric(6,2),
  priority smallint not null default 3,
  origin text not null default 'extracted' check (origin in ('manual', 'extracted', 'merged')),
  source_pages integer[] not null default '{}',
  confidence numeric(5,2),
  topic_count integer not null default 0,
  mastery numeric(5,2) not null default 0,
  syllabus jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.edital_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.exam_projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  sha256 text not null,
  storage_path text not null,
  source_type text not null default 'plain-text' check (source_type in ('pdf-textual', 'pdf-scan', 'image', 'plain-text')),
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.edital_extraction_runs (
  id uuid primary key default gen_random_uuid(),
  edital_file_id uuid not null references public.edital_files(id) on delete cascade,
  project_id uuid not null references public.exam_projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'review', 'ready', 'failed')),
  model text,
  prompt_version text not null default 'v1',
  classifier text,
  summary_md text,
  structured_data jsonb not null default '{}'::jsonb,
  artifact_path text,
  raw_text text,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  estimated_cost numeric(10,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.edital_sections (
  id uuid primary key default gen_random_uuid(),
  extraction_run_id uuid not null references public.edital_extraction_runs(id) on delete cascade,
  project_id uuid not null references public.exam_projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  section_title text,
  page_from integer,
  page_to integer,
  confidence numeric(5,2),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.exam_projects(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  notes text,
  scheduled_for date not null,
  duration_min integer not null default 90,
  task_type text not null default 'study' check (task_type in ('study', 'revision', 'questions', 'mock', 'material')),
  source text not null default 'manual' check (source in ('manual', 'ai', 'carry-over')),
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped', 'delayed')),
  confidence numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.exam_projects(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  study_task_id uuid references public.study_tasks(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  next_review_at date not null,
  last_reviewed_at date,
  interval_days integer not null default 1,
  ease_factor numeric(6,2) not null default 2.5,
  status text not null default 'active' check (status in ('active', 'done', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.exam_projects(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.flashcard_decks(id) on delete cascade,
  project_id uuid not null references public.exam_projects(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  front text not null,
  back text not null,
  next_review_at date,
  last_reviewed_at date,
  interval_days integer not null default 1,
  ease_factor numeric(6,2) not null default 2.5,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.exam_projects(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  type text not null check (type in ('file', 'link', 'note', 'ai-summary')),
  storage_path text,
  url text,
  content_md text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  project_id uuid references public.exam_projects(id) on delete set null,
  task text not null,
  provider text,
  prompt_version text,
  document_sha256 text,
  cached boolean not null default false,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  estimated_cost numeric(10,4) not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists exam_projects_user_id_id_idx
  on public.exam_projects (user_id, id);

create unique index if not exists edital_files_project_sha256_idx
  on public.edital_files (project_id, sha256);

create index if not exists subjects_project_user_idx
  on public.subjects (project_id, user_id);

create index if not exists study_tasks_user_scheduled_idx
  on public.study_tasks (user_id, scheduled_for);

create index if not exists review_items_user_next_review_idx
  on public.review_items (user_id, next_review_at)
  where status = 'active';

create index if not exists flashcards_user_next_review_idx
  on public.flashcards (user_id, next_review_at)
  where suspended = false;

create index if not exists extraction_runs_file_status_created_idx
  on public.edital_extraction_runs (edital_file_id, status, created_at desc);

create index if not exists edital_sections_content_gin_idx
  on public.edital_sections using gin (to_tsvector('portuguese', content));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'exam_projects',
    'subjects',
    'edital_files',
    'edital_extraction_runs',
    'edital_sections',
    'study_tasks',
    'review_items',
    'flashcard_decks',
    'flashcards',
    'materials'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute procedure public.set_row_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'exam_projects',
    'subjects',
    'edital_files',
    'edital_extraction_runs',
    'edital_sections',
    'study_tasks',
    'review_items',
    'flashcard_decks',
    'flashcards',
    'materials'
  ]
  loop
    execute format('drop policy if exists %I_select_own on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_insert_own on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_update_own on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_delete_own on public.%I', table_name, table_name);

    execute format(
      'create policy %I_select_own on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_insert_own on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_update_own on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_delete_own on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
      table_name,
      table_name
    );
  end loop;
end;
$$;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'edital-private',
    'edital-private',
    false,
    52428800,
    array['application/pdf', 'image/png', 'image/jpeg', 'text/plain']
  ),
  (
    'ai-artifacts-private',
    'ai-artifacts-private',
    false,
    52428800,
    array['application/json', 'text/plain', 'text/markdown']
  )
on conflict (id) do nothing;

drop policy if exists edital_private_read on storage.objects;
drop policy if exists edital_private_insert on storage.objects;
drop policy if exists edital_private_update on storage.objects;
drop policy if exists edital_private_delete on storage.objects;
drop policy if exists ai_artifacts_private_read on storage.objects;
drop policy if exists ai_artifacts_private_insert on storage.objects;
drop policy if exists ai_artifacts_private_update on storage.objects;
drop policy if exists ai_artifacts_private_delete on storage.objects;

create policy edital_private_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'edital-private'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy edital_private_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'edital-private'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy edital_private_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'edital-private'
  and split_part(name, '/', 1) = (select auth.uid())::text
)
with check (
  bucket_id = 'edital-private'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy edital_private_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'edital-private'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy ai_artifacts_private_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'ai-artifacts-private'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy ai_artifacts_private_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'ai-artifacts-private'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy ai_artifacts_private_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'ai-artifacts-private'
  and split_part(name, '/', 1) = (select auth.uid())::text
)
with check (
  bucket_id = 'ai-artifacts-private'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy ai_artifacts_private_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'ai-artifacts-private'
  and split_part(name, '/', 1) = (select auth.uid())::text
);
