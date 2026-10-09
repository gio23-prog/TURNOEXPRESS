-- ============================================================================
-- Migración 9: las preguntas del empleador pueden tener hasta 500 caracteres (antes 200).
-- ============================================================================
alter table public.job_questions drop constraint if exists job_questions_prompt_check;
alter table public.job_questions
  add constraint job_questions_prompt_check check (length(trim(prompt)) between 5 and 500);
