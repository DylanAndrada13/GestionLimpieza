-- Shared product catalog and private shop data. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.catalog_families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.catalog_families(id) on delete cascade,
  primary_barcode text not null unique check (primary_barcode ~ '^[0-9]{8,14}$'),
  name text not null,
  brand text not null default '',
  quantity text not null default '',
  category text not null default '',
  image_url text,
  source text not null default 'community',
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_barcodes (
  barcode text primary key check (barcode ~ '^[0-9]{8,14}$'),
  item_id uuid not null references public.catalog_items(id) on delete cascade,
  source text not null default 'community',
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists catalog_items_family_idx on public.catalog_items(family_id);
create index if not exists catalog_items_brand_idx on public.catalog_items(lower(brand));
create index if not exists catalog_items_name_idx on public.catalog_items using gin (to_tsvector('simple', name || ' ' || brand));
create index if not exists catalog_barcodes_item_idx on public.catalog_barcodes(item_id);

-- The browser never talks to these tables using a service key. Only the Vercel
-- API/server can access them; the service-role key must remain server-side.
alter table public.catalog_families enable row level security;
alter table public.catalog_items enable row level security;
alter table public.catalog_barcodes enable row level security;
revoke all on public.catalog_families, public.catalog_items, public.catalog_barcodes from anon, authenticated;
grant all on public.catalog_families, public.catalog_items, public.catalog_barcodes to service_role;

create or replace function public.catalog_contribute(
  p_barcode text,
  p_name text,
  p_brand text default '',
  p_quantity text default '',
  p_category text default '',
  p_image_url text default null,
  p_link_barcode text default null,
  p_family_barcode text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item_id uuid;
  v_family_id uuid;
  v_existing_item uuid;
  v_item public.catalog_items%rowtype;
begin
  if p_barcode !~ '^[0-9]{8,14}$' then
    raise exception 'invalid barcode';
  end if;

  select item_id into v_existing_item from public.catalog_barcodes where barcode = p_barcode;
  if found then
    select * into v_item from public.catalog_items where id = v_existing_item;
    return jsonb_build_object('created', false, 'item', to_jsonb(v_item));
  end if;

  if p_link_barcode is not null then
    select item_id into v_item_id from public.catalog_barcodes where barcode = p_link_barcode;
    if not found then raise exception 'linked barcode not found'; end if;
    insert into public.catalog_barcodes(barcode, item_id, source, verified)
      values (p_barcode, v_item_id, 'community', false)
      on conflict (barcode) do nothing;
    select * into v_item from public.catalog_items where id = v_item_id;
    return jsonb_build_object('created', false, 'linked', true, 'item', to_jsonb(v_item));
  end if;

  if p_family_barcode is not null then
    select ci.family_id into v_family_id
      from public.catalog_barcodes cb join public.catalog_items ci on ci.id = cb.item_id
      where cb.barcode = p_family_barcode;
    if not found then raise exception 'family barcode not found'; end if;
  else
    insert into public.catalog_families(name, brand)
      values (left(trim(p_name), 180), left(trim(coalesce(p_brand, '')), 100))
      returning id into v_family_id;
  end if;

  insert into public.catalog_items(family_id, primary_barcode, name, brand, quantity, category, image_url, source, verified)
    values (v_family_id, p_barcode, left(trim(p_name), 180), left(trim(coalesce(p_brand, '')), 100), left(trim(coalesce(p_quantity, '')), 80), left(trim(coalesce(p_category, '')), 100), p_image_url, 'community', false)
    returning id into v_item_id;
  insert into public.catalog_barcodes(barcode, item_id, source, verified)
    values (p_barcode, v_item_id, 'community', false);
  select * into v_item from public.catalog_items where id = v_item_id;
  return jsonb_build_object('created', true, 'item', to_jsonb(v_item));
end;
$$;

create or replace function public.catalog_import_batch(p_products jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  p jsonb;
  v_item_id uuid;
  v_family_id uuid;
  v_codes text[];
  v_code text;
  v_inserted integer := 0;
  v_linked integer := 0;
begin
  if jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products) > 250 then
    raise exception 'batch must contain up to 250 products';
  end if;
  for p in select value from jsonb_array_elements(p_products) loop
    v_codes := array(select distinct regexp_replace(value, '[^0-9]', '', 'g') from jsonb_array_elements_text(coalesce(p->'barcodes', '[]'::jsonb)));
    v_code := regexp_replace(coalesce(p->>'barcode', ''), '[^0-9]', '', 'g');
    if v_code !~ '^[0-9]{8,14}$' then continue; end if;
    v_codes := array(select distinct code from unnest(array_append(coalesce(v_codes, '{}'::text[]), v_code)) as codes(code) where code ~ '^[0-9]{8,14}$');
    select cb.item_id into v_item_id from public.catalog_barcodes cb where cb.barcode = any(v_codes) limit 1;
    if v_item_id is null then
      insert into public.catalog_families(name, brand) values (left(coalesce(p->>'name', 'Producto importado'),180), left(coalesce(p->>'brand',''),100)) returning id into v_family_id;
      insert into public.catalog_items(family_id, primary_barcode, name, brand, quantity, category, image_url, source, verified)
        values (v_family_id, v_code, left(coalesce(p->>'name','Producto importado'),180), left(coalesce(p->>'brand',''),100), left(coalesce(p->>'quantity',''),80), left(coalesce(p->>'category','Limpieza'),100), nullif(p->>'image',''), coalesce(nullif(p->>'source',''),'import'), false)
        on conflict (primary_barcode) do nothing returning id into v_item_id;
      if v_item_id is not null then v_inserted := v_inserted + 1; end if;
    else
      v_linked := v_linked + 1;
    end if;
    if v_item_id is not null then
      foreach v_code in array v_codes loop
        insert into public.catalog_barcodes(barcode, item_id, source, verified)
          values (v_code, v_item_id, coalesce(nullif(p->>'source',''),'import'), false)
          on conflict (barcode) do nothing;
      end loop;
    end if;
    v_item_id := null;
    v_family_id := null;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'linked', v_linked);
end;
$$;

revoke all on function public.catalog_contribute(text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.catalog_contribute(text,text,text,text,text,text,text,text) to service_role;
revoke all on function public.catalog_import_batch(jsonb) from public, anon, authenticated;
grant execute on function public.catalog_import_batch(jsonb) to service_role;

-- Private shop data. Prices belong to the shop inventory and are separate
-- from the shared catalog above.
create table if not exists public.shop_products (
  barcode text primary key check (barcode ~ '^[0-9]{8,14}$'),
  barcodes text[] not null default '{}',
  name text not null,
  brand text not null default '',
  category text not null default '',
  quantity text not null default '',
  image_url text,
  price numeric(12,2) not null default 0 check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_products_name_idx on public.shop_products using gin (to_tsvector('simple', name || ' ' || brand));

create table if not exists public.shop_cart (
  id text primary key default 'current' check (id = 'current'),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_purchases (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  total numeric(12,2) not null check (total >= 0),
  units integer not null check (units > 0),
  items jsonb not null check (jsonb_typeof(items) = 'array')
);

create index if not exists shop_purchases_occurred_at_idx on public.shop_purchases(occurred_at desc);

-- Stock received through product registration/updates. Purchases remain in
-- shop_purchases, so stock decreases from sales are not duplicated here.
create table if not exists public.shop_stock_movements (
  id bigint generated always as identity primary key,
  barcode text not null check (barcode ~ '^[0-9]{8,14}$'),
  product_name text not null,
  previous_stock integer not null default 0 check (previous_stock >= 0),
  new_stock integer not null check (new_stock >= 0),
  quantity_added integer not null check (quantity_added > 0),
  occurred_at timestamptz not null default now()
);

create index if not exists shop_stock_movements_occurred_at_idx on public.shop_stock_movements(occurred_at desc);

create or replace function public.log_shop_stock_received()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_previous integer := 0;
  v_added integer;
begin
  if tg_op = 'UPDATE' then
    v_previous := old.stock;
  end if;
  v_added := new.stock - v_previous;
  if v_added > 0 then
    insert into public.shop_stock_movements(barcode, product_name, previous_stock, new_stock, quantity_added)
      values (new.barcode, new.name, v_previous, new.stock, v_added);
  end if;
  return new;
end;
$$;

drop trigger if exists shop_products_stock_received on public.shop_products;
create trigger shop_products_stock_received
  after insert or update of stock on public.shop_products
  for each row execute function public.log_shop_stock_received();

revoke all on function public.log_shop_stock_received() from public, anon, authenticated;
grant execute on function public.log_shop_stock_received() to service_role;

create table if not exists public.shop_scan_history (
  barcode text primary key check (barcode ~ '^[0-9]{8,14}$'),
  scanned_at timestamptz not null default now(),
  found boolean,
  name text not null default ''
);

create index if not exists shop_scan_history_scanned_at_idx on public.shop_scan_history(scanned_at desc);

alter table public.shop_products enable row level security;
alter table public.shop_cart enable row level security;
alter table public.shop_purchases enable row level security;
alter table public.shop_stock_movements enable row level security;
alter table public.shop_scan_history enable row level security;
revoke all on public.shop_products, public.shop_cart, public.shop_purchases, public.shop_stock_movements, public.shop_scan_history from anon, authenticated;
grant all on public.shop_products, public.shop_cart, public.shop_purchases, public.shop_stock_movements, public.shop_scan_history to service_role;
grant usage, select on sequence public.shop_stock_movements_id_seq to service_role;

create or replace function public.reset_shop_inventory()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.shop_products
  set price = 0, updated_at = now()
  where barcode is not null;
end;
$$;

revoke all on function public.reset_shop_inventory() from public, anon, authenticated;
grant execute on function public.reset_shop_inventory() to service_role;

create or replace function public.record_shop_purchase(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_line jsonb;
  v_code text;
  v_qty integer;
  v_price numeric(12,2);
  v_total numeric(12,2) := 0;
  v_units integer := 0;
  v_purchase public.shop_purchases%rowtype;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 200 then
    raise exception 'purchase must contain between 1 and 200 items';
  end if;

  for v_line in select value from jsonb_array_elements(p_items) loop
    v_code := coalesce(v_line->>'barcode', '');
    v_qty := coalesce((v_line->>'qty')::integer, 0);
    v_price := coalesce((v_line->>'price')::numeric, 0);
    if v_code !~ '^[0-9]{8,14}$' or v_qty < 1 or v_price < 0 then
      raise exception 'invalid purchase item';
    end if;
    v_units := v_units + v_qty;
    v_total := v_total + v_price * v_qty;
  end loop;

  for v_line in select value from jsonb_array_elements(p_items) loop
    v_code := coalesce(v_line->>'barcode', '');
    v_qty := (v_line->>'qty')::integer;
    update public.shop_products
      set stock = greatest(0, stock - v_qty), updated_at = now()
      where barcode = v_code or barcodes @> array[v_code];
  end loop;

  insert into public.shop_purchases(total, units, items)
    values (v_total, v_units, p_items)
    returning * into v_purchase;
  delete from public.shop_cart where id = 'current';
  return to_jsonb(v_purchase);
end;
$$;

revoke all on function public.record_shop_purchase(jsonb) from public, anon, authenticated;
grant execute on function public.record_shop_purchase(jsonb) to service_role;
