-- Where the websites find a Quant node. The node's computer publishes its current tunnel URL
-- with publish_node(); anyone can read it. Writing needs the secret whose hash is stored here.
create table if not exists public.quant_node (
  network    text primary key check (network in ('main', 'test', 'regtest')),
  url        text not null check (url ~ '^https://[a-z0-9.-]+(:[0-9]+)?/?$'),
  updated_at timestamptz not null default now()
);
alter table public.quant_node enable row level security;
drop policy if exists "anyone can read node url" on public.quant_node;
create policy "anyone can read node url" on public.quant_node for select to anon, authenticated using (true);

create table if not exists private_quant_secret (
  id          int primary key default 1 check (id = 1),
  secret_hash text not null
);
-- Not exposed through the API (no grants, RLS on, no policies).
alter table private_quant_secret enable row level security;
revoke all on private_quant_secret from anon, authenticated;

create or replace function public.publish_node(p_network text, p_url text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from private_quant_secret where secret_hash = encode(digest(p_secret, 'sha256'), 'hex')) then
    raise exception 'not allowed';
  end if;
  insert into quant_node (network, url, updated_at) values (p_network, p_url, now())
  on conflict (network) do update set url = excluded.url, updated_at = now();
end;
$$;
revoke all on function public.publish_node(text, text, text) from public;
grant execute on function public.publish_node(text, text, text) to anon, authenticated;
