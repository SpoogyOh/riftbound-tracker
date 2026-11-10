begin;

-- Copies are counted per language: one row per (owner, variant, language). Existing rows are English.
alter table public.collection_items
  add column language text not null default 'EN' check (language ~ '^[A-Z]{2,3}$');
alter table public.collection_items drop constraint collection_items_pkey;
alter table public.collection_items add primary key (user_id, variant_id, language);

comment on column public.collection_items.language is
  'OpenRift language code of these copies. The variant lists its available languages in details.languages.';

-- Same trigger as before, extended with the language and image-size checks.
create or replace function private.check_collection_finishes()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  variant public.catalog_variants;
begin
  select * into strict variant from public.catalog_variants where id = new.variant_id;
  if (new.normal > 0 and not variant.special_finish and not ('normal' = any(variant.finishes)))
    or (new.foil > 0 and not ('foil' = any(variant.finishes))) then
    raise exception 'This finish is not available for the selected variant.' using errcode = '23514';
  end if;
  -- Catalog rows imported before languages were tracked are English only.
  if (new.normal > 0 or new.foil > 0)
    and not (coalesce(variant.details -> 'languages', '["EN"]'::jsonb) ? new.language) then
    raise exception 'This language is not available for the selected variant.' using errcode = '23514';
  end if;
  -- Uploaded images are stored inline. Only new or changed images are checked,
  -- so quantities of a row with an older, larger image stay editable.
  if new.image_override is not null and length(new.image_override) > 400000
    and (tg_op = 'INSERT' or new.image_override is distinct from old.image_override) then
    raise exception 'The card image is too large.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- p_language defaults to English, so clients deployed before this migration keep working.
drop function public.adjust_collection_quantity(text, text, integer);
create function public.adjust_collection_quantity(
  p_variant_id text, p_finish text, p_delta integer, p_language text default 'EN')
returns public.collection_items language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  result public.collection_items;
begin
  if owner_id is null then
    raise exception 'Sign in before changing quantities.' using errcode = '42501';
  end if;
  if p_finish is null or p_finish not in ('normal', 'foil')
    or p_delta is null or p_delta not between -999 and 999
    or p_language is null or p_language !~ '^[A-Z]{2,3}$' then
    raise exception 'Invalid finish, language or quantity adjustment.' using errcode = '22023';
  end if;
  insert into public.collection_items(user_id, variant_id, language) values (owner_id, p_variant_id, p_language)
    on conflict (user_id, variant_id, language) do nothing;
  update public.collection_items
    set normal = normal + case when p_finish = 'normal' then p_delta else 0 end,
        foil = foil + case when p_finish = 'foil' then p_delta else 0 end
    where user_id = owner_id and variant_id = p_variant_id and language = p_language
    returning * into strict result;
  return result;
end;
$$;

revoke all on function public.adjust_collection_quantity(text, text, integer, text) from public, anon, authenticated;
grant execute on function public.adjust_collection_quantity(text, text, integer, text) to authenticated;

commit;
