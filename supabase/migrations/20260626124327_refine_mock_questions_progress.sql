alter table public.mock_questions
  add column if not exists topic text,
  add column if not exists selected_answer text,
  add column if not exists is_correct boolean,
  add column if not exists answered_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists mock_questions_user_project_answered_idx
  on public.mock_questions (user_id, project_id, answered_at desc)
  where answered_at is not null;

create index if not exists mock_questions_user_project_pending_idx
  on public.mock_questions (user_id, project_id, created_at desc)
  where answered_at is null;

create index if not exists mock_questions_user_subject_idx
  on public.mock_questions (user_id, subject_id, answered_at desc)
  where answered_at is not null;
