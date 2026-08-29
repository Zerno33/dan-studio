-- Afiliacja v1: kod nauczyciela + kto przyszedł z linku. Bez prowizji (nie ma jeszcze płatności).
alter table public.profiles
  add column if not exists referred_by text;

alter table public.profiles
  add column if not exists referral_code text;

create unique index if not exists profiles_referral_code_uidx
  on public.profiles (referral_code)
  where referral_code is not null;
