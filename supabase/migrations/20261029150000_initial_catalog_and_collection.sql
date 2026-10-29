begin;

-- Keep It Simple, But Significant: one shared catalog, one private collection per user.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.catalog_variants (
  id text primary key check (length(id) > 0),
  card_id text not null,
  name text not null check (length(trim(name)) > 0),
  number text not null,
  set_code text not null,
  finishes text[] not null check (cardinality(finishes) > 0 and array_position(finishes, null) is null),
  special_finish boolean not null default false,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  active boolean not null default true,
  imported_at timestamptz not null default now()
);

comment on table public.catalog_variants is
  'Shared tracker variants. Preserve existing openrift-* IDs; archive removed variants instead of deleting owned entries.';
comment on column public.catalog_variants.details is
  'Additional catalog fields, including sourcePrintingIds and rules. Personal quantities never belong here.';

create table public.collection_items (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  variant_id text not null references public.catalog_variants(id) on delete restrict,
  normal smallint not null default 0 check (normal between 0 and 999),
  foil smallint not null default 0 check (foil between 0 and 999),
  image_override text,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, variant_id)
);

-- The primary key indexes owner-scoped reads; this index supports the catalog FK.
create index collection_items_variant_id_idx on public.collection_items(variant_id);

create table public.custom_cards (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (length(id) > 0),
  name text not null check (length(trim(name)) > 0),
  number text not null,
  normal smallint not null default 0 check (normal between 0 and 999),
  foil smallint not null default 0 check (foil between 0 and 999),
  migration_review boolean not null default false,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

comment on table public.custom_cards is
  'Private custom and unresolved historical entries. IDs may retain an old openrift-* ID when migration cannot match it.';

create function private.stamp_collection_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  new.revision := case when tg_op = 'INSERT' then 0 else old.revision + 1 end;
  return new;
end;
$$;

create function private.check_collection_finishes()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  variant public.catalog_variants;
begin
  select * into strict variant from public.catalog_variants where id = new.variant_id;
  if (new.normal > 0 and not variant.special_finish and not ('normal' = any(variant.finishes)))
    or (new.foil > 0 and not ('foil' = any(variant.finishes))) then
    raise exception 'This finish is not available for the selected variant.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.stamp_collection_write() from public, anon, authenticated;
revoke all on function private.check_collection_finishes() from public, anon, authenticated;

create trigger collection_items_check_finishes before insert or update on public.collection_items
  for each row execute function private.check_collection_finishes();
create trigger collection_items_stamp before insert or update on public.collection_items
  for each row execute function private.stamp_collection_write();
create trigger custom_cards_stamp before insert or update on public.custom_cards
  for each row execute function private.stamp_collection_write();

alter table public.catalog_variants enable row level security;
alter table public.collection_items enable row level security;
alter table public.custom_cards enable row level security;

-- Policies and grants are both required. Clear permissive Supabase defaults explicitly.
revoke all on public.catalog_variants, public.collection_items, public.custom_cards
  from public, anon, authenticated;
grant select on public.catalog_variants to authenticated;
grant select, insert, update, delete on public.collection_items, public.custom_cards to authenticated;
grant all on public.catalog_variants, public.collection_items, public.custom_cards to service_role;

create policy catalog_read on public.catalog_variants for select to authenticated using (true);

create policy collection_read on public.collection_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy collection_insert on public.collection_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy collection_update on public.collection_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy collection_delete on public.collection_items for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy custom_read on public.custom_cards for select to authenticated
  using ((select auth.uid()) = user_id);
create policy custom_insert on public.custom_cards for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy custom_update on public.custom_cards for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy custom_delete on public.custom_cards for delete to authenticated
  using ((select auth.uid()) = user_id);

-- A row-level SQL increment avoids read-modify-write loss across devices.
-- Clients must not automatically retry a delta after an uncertain network result.
create function public.adjust_collection_quantity(p_variant_id text, p_finish text, p_delta integer)
returns public.collection_items language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  result public.collection_items;
begin
  if owner_id is null then
    raise exception 'Sign in before changing quantities.' using errcode = '42501';
  end if;
  if p_finish is null or p_finish not in ('normal', 'foil')
    or p_delta is null or p_delta not between -999 and 999 then
    raise exception 'Invalid finish or quantity adjustment.' using errcode = '22023';
  end if;
  insert into public.collection_items(user_id, variant_id) values (owner_id, p_variant_id)
    on conflict (user_id, variant_id) do nothing;
  update public.collection_items
    set normal = normal + case when p_finish = 'normal' then p_delta else 0 end,
        foil = foil + case when p_finish = 'foil' then p_delta else 0 end
    where user_id = owner_id and variant_id = p_variant_id returning * into strict result;
  return result;
end;
$$;

revoke all on function public.adjust_collection_quantity(text, text, integer) from public, anon, authenticated;
grant execute on function public.adjust_collection_quantity(text, text, integer) to authenticated;

commit;
