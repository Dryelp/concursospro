create table if not exists public.mock_questions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.exam_projects(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  statement text not null,
  alternatives jsonb not null default '[]'::jsonb,
  correct_answer text not null,
  explanation text,
  difficulty text not null default 'medio' check (difficulty in ('facil', 'medio', 'dificil')),
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.exam_projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.review_items
  add column if not exists repetitions integer not null default 0,
  add column if not exists last_score integer;

alter table public.flashcards
  add column if not exists repetitions integer not null default 0,
  add column if not exists last_score integer;

create index if not exists mock_questions_user_project_idx
  on public.mock_questions (user_id, project_id, created_at desc);

create index if not exists chat_messages_user_project_idx
  on public.chat_messages (user_id, project_id, created_at);

alter table public.mock_questions enable row level security;
alter table public.chat_messages enable row level security;
alter table private.ai_usage_events enable row level security;

grant select, insert, update, delete on public.mock_questions to authenticated;
grant select, insert, update, delete on public.chat_messages to authenticated;

drop policy if exists mock_questions_select_own on public.mock_questions;
drop policy if exists mock_questions_insert_own on public.mock_questions;
drop policy if exists mock_questions_update_own on public.mock_questions;
drop policy if exists mock_questions_delete_own on public.mock_questions;
create policy mock_questions_select_own on public.mock_questions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy mock_questions_insert_own on public.mock_questions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy mock_questions_update_own on public.mock_questions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy mock_questions_delete_own on public.mock_questions
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists chat_messages_select_own on public.chat_messages;
drop policy if exists chat_messages_insert_own on public.chat_messages;
drop policy if exists chat_messages_update_own on public.chat_messages;
drop policy if exists chat_messages_delete_own on public.chat_messages;
create policy chat_messages_select_own on public.chat_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy chat_messages_insert_own on public.chat_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy chat_messages_update_own on public.chat_messages
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy chat_messages_delete_own on public.chat_messages
  for delete to authenticated using ((select auth.uid()) = user_id);
