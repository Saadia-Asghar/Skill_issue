-- Roast & Toast verdict persistence.
-- Stores short slang verdicts so grading can carry style memory across sessions.

alter table if exists public.gauntlet_attempts
  add column if not exists slang_verdict text;

alter table if exists public.blitz_answers
  add column if not exists slang_verdict text;

comment on column public.gauntlet_attempts.slang_verdict is
  'Short roast/toast verdict generated at run submission time.';

comment on column public.blitz_answers.slang_verdict is
  'Short roast/toast verdict generated per answered blitz question.';
