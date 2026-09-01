-- referred_by w BRNS jest uuid (stary szkic). Aplikacja zapisuje kod tekstowy (np. mati).
alter table public.profiles
  alter column referred_by type text using referred_by::text;

create or replace function public.apply_referred_by_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  if new.referred_by is not null then
    return new;
  end if;
  select lower(trim(u.raw_user_meta_data->>'referred_by'))
    into code
  from auth.users u
  where u.id = new.id;
  if code is not null and code ~ '^[a-z0-9_-]{1,32}$' then
    new.referred_by := code;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_referred_by_from_auth on public.profiles;
create trigger profiles_referred_by_from_auth
before insert or update of referred_by on public.profiles
for each row execute procedure public.apply_referred_by_from_auth();

update public.profiles p
set referred_by = lower(trim(u.raw_user_meta_data->>'referred_by'))
from auth.users u
where u.id = p.id
  and (p.referred_by is null or p.referred_by = '')
  and coalesce(u.raw_user_meta_data->>'referred_by', '') ~ '^[A-Za-z0-9_-]{1,32}$';

insert into public.referrals (teacher_id, user_id, status, commission_accrued)
select t.id, s.id, 'active', 0
from public.profiles s
join public.profiles t on t.referral_code = s.referred_by
where s.referred_by is not null
  and s.referred_by <> ''
  and s.id <> t.id
on conflict (user_id) do nothing;
