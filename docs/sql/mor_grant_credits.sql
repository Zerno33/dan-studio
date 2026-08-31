-- Atomowe doładowanie + idempotencja webhooka MoR (event_id).
alter table public.credit_transactions
  add column if not exists external_event_id text;

create unique index if not exists credit_transactions_external_event_id_uidx
  on public.credit_transactions (external_event_id)
  where external_event_id is not null;

create or replace function public.grant_credits(
  p_user uuid,
  p_amount integer,
  p_reason text,
  p_event_id text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  begin
    insert into public.credit_transactions (user_id, delta, reason, external_event_id)
    values (p_user, p_amount, coalesce(p_reason, 'mor_topup'), p_event_id);
  exception
    when unique_violation then
      select balance into new_balance from public.credits where user_id = p_user;
      return coalesce(new_balance, 0);
  end;

  insert into public.credits (user_id, balance)
  values (p_user, p_amount)
  on conflict (user_id)
  do update set balance = public.credits.balance + excluded.balance
  returning balance into new_balance;

  return new_balance;
end;
$$;

grant execute on function public.grant_credits(uuid, integer, text, text) to service_role;
