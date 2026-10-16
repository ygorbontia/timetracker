-- Rode este arquivo inteiro uma vez em: Supabase > SQL Editor > New query > Run

create sequence if not exists public.records_srv_seq;

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  k       text   not null,
  v       jsonb,
  ts      bigint not null,
  dead    boolean not null default false,
  srv     bigint not null default nextval('public.records_srv_seq'),
  primary key (user_id, k)
);
create index if not exists records_srv_idx on public.records (user_id, srv);

-- A versão mais nova (ts) de cada registro vence; envios antigos são ignorados. Cada gravação ganha novo número "srv".
create or replace function public.records_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.ts <= old.ts then return null; end if;
  end if;
  new.srv := nextval('public.records_srv_seq');
  return new;
end $$;
drop trigger if exists records_guard on public.records;
create trigger records_guard before insert or update on public.records for each row execute function public.records_guard();

alter table public.records enable row level security;
drop policy if exists "own rows" on public.records;
create policy "own rows" on public.records for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Excluir a própria conta (usado pelo botão "Excluir conta" do aplicativo)
create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
