-- Supabase SQL Editor에서 실행. anon은 RPC로만 허용된 카운터를 읽고 올릴 수 있다.
create table if not exists public.site_counters (
  name text primary key,
  n bigint not null default 0
);
alter table public.site_counters enable row level security;
revoke all on table public.site_counters from public, anon, authenticated;

create or replace function public.bump_counter(name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  result bigint;
begin
  if $1 is distinct from 'copy-prompt' then
    raise exception 'Counter name is not allowed' using errcode = '22023';
  end if;
  insert into public.site_counters as counters (name, n)
    values ($1, 1)
    on conflict on constraint site_counters_pkey
    do update set n = counters.n + 1
    returning n into result;
  return result;
end;
$$;

create or replace function public.get_counter(name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  result bigint;
begin
  if $1 is distinct from 'copy-prompt' then
    raise exception 'Counter name is not allowed' using errcode = '22023';
  end if;
  select counters.n into result from public.site_counters as counters where counters.name = $1;
  return coalesce(result, 0);
end;
$$;

revoke all on function public.bump_counter(text) from public, anon, authenticated;
revoke all on function public.get_counter(text) from public, anon, authenticated;
grant execute on function public.bump_counter(text) to anon;
grant execute on function public.get_counter(text) to anon;
