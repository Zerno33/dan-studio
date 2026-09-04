-- BRNS: tabela payout_requests mogła powstać bez `note`.
-- SQL Editor → Run. Potem Reload schema w API (albo poczekaj ~minutę).

alter table public.payout_requests
  add column if not exists note text;
