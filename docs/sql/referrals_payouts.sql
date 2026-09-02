-- Afiliacja v2: wiersz polecenia + zgłoszenie wypłaty (ręcznie, bez Polar).
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id),
  user_id uuid not null references public.profiles (id),
  status text not null default 'active',
  commission_accrued numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id),
  status text not null default 'pending',
  note text,
  created_at timestamptz not null default now()
);

alter table public.referrals enable row level security;
alter table public.payout_requests enable row level security;

create unique index if not exists referrals_user_id_uidx on public.referrals (user_id);

insert into public.referrals (teacher_id, user_id, status, commission_accrued)
select t.id, s.id, 'active', 0
from public.profiles s
join public.profiles t on t.referral_code = s.referred_by
where s.referred_by is not null
  and s.id <> t.id
  and not exists (select 1 from public.referrals r where r.user_id = s.id);
