-- Wklej w Supabase → SQL Editor (projekt BRNS), zanim testujesz miniatury na nowym deployu.
alter table public.prompts
  add column if not exists source_preview text;
