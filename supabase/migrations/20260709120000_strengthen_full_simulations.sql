alter table public.mock_questions
  add column if not exists simulation_order integer,
  add column if not exists matrix_subject_name text,
  add column if not exists matrix_subject_order integer,
  add column if not exists planned_topic text;

alter table public.mock_simulations
  add column if not exists expected_questions integer,
  add column if not exists generated_questions integer not null default 0;

update public.mock_simulations
set expected_questions = coalesce(expected_questions, total_questions),
    generated_questions = case
      when generated_questions = 0 and status in ('not_started', 'in_progress', 'completed') then total_questions
      else generated_questions
    end
where expected_questions is null
   or (generated_questions = 0 and status in ('not_started', 'in_progress', 'completed'));

do $$
begin
  alter table public.mock_questions
    add constraint mock_questions_simulation_order_positive
    check (simulation_order is null or simulation_order > 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.mock_simulations
    add constraint mock_simulations_expected_questions_positive
    check (expected_questions is null or expected_questions > 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.mock_simulations
    add constraint mock_simulations_generated_questions_non_negative
    check (generated_questions >= 0);
exception
  when duplicate_object then null;
end $$;

create index if not exists mock_questions_simulation_order_idx
  on public.mock_questions (simulation_id, simulation_order)
  where simulation_id is not null;

create index if not exists mock_questions_matrix_subject_idx
  on public.mock_questions (project_id, user_id, matrix_subject_order, matrix_subject_name)
  where simulation_id is not null;
