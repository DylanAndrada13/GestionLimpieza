-- Refuerza el registro de compras en una base que ya está en uso.
--
-- Antes, la función aceptaba el precio enviado por el navegador y dejaba el
-- stock en cero aunque no hubiera unidades suficientes. Esta versión valida
-- existencia, stock y precio dentro de la base y registra la compra de forma
-- atómica.
--
-- Ejecutar en Supabase > SQL Editor. Es idempotente: se puede ejecutar más de
-- una vez sin perder datos.

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
  v_matches integer;
  v_candidate public.shop_products%rowtype;
  v_product public.shop_products%rowtype;
  v_resolved jsonb := '{}'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_units integer := 0;
  v_purchase public.shop_purchases%rowtype;
begin
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 200 then
    raise exception 'invalid purchase items' using errcode = '22023';
  end if;

  -- Validar las líneas antes de convertir cualquier valor numérico.
  for v_line in select value from jsonb_array_elements(p_items) loop
    v_code := coalesce(v_line->>'barcode', '');
    if v_code !~ '^[0-9]{8,14}$' or coalesce(v_line->>'qty', '') !~ '^[0-9]{1,6}$' then
      raise exception 'invalid purchase item' using errcode = '22023';
    end if;
    v_qty := (v_line->>'qty')::integer;
    if v_qty < 1 or v_qty > 100000 then
      raise exception 'invalid purchase item' using errcode = '22023';
    end if;
  end loop;

  -- Bloquear los productos y resolver los códigos alternativos al código
  -- principal. Si un código pertenece a más de un producto, se rechaza en vez
  -- de adivinar cuál vender.
  for v_line in select value from jsonb_array_elements(p_items) loop
    v_code := v_line->>'barcode';
    v_qty := (v_line->>'qty')::integer;
    v_matches := 0;
    for v_candidate in
      select * from public.shop_products
      where barcode = v_code or v_code = any(barcodes)
      for update
    loop
      v_matches := v_matches + 1;
      if v_candidate.barcode = v_code then
        v_product := v_candidate;
      elsif v_matches = 1 then
        v_product := v_candidate;
      end if;
    end loop;
    if v_matches = 0 then
      raise exception 'product not found: %', v_code;
    end if;
    if v_matches > 1 then
      raise exception 'ambiguous barcode: %', v_code;
    end if;
    -- Unir líneas repetidas que apuntan al mismo producto.
    v_resolved := jsonb_set(
      v_resolved,
      array[v_product.barcode],
      to_jsonb(coalesce((v_resolved->>v_product.barcode)::integer, 0) + v_qty),
      true
    );
  end loop;

  -- Usar el precio y los datos guardados en el inventario, nunca los del navegador.
  for v_code, v_qty in select key, value::integer from jsonb_each_text(v_resolved) loop
    select * into v_product from public.shop_products where barcode = v_code for update;
    if v_product.stock < v_qty then
      raise exception 'insufficient stock: %', v_product.name;
    end if;
    v_total := v_total + v_product.price * v_qty;
    if v_total > 9999999999.99 then
      raise exception 'purchase total is too large' using errcode = '22003';
    end if;
    v_units := v_units + v_qty;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'barcode', v_product.barcode,
      'name', v_product.name,
      'brand', v_product.brand,
      'quantity', v_product.quantity,
      'image', coalesce(v_product.image_url, ''),
      'price', v_product.price,
      'qty', v_qty
    ));
    update public.shop_products
      set stock = stock - v_qty, updated_at = now()
      where barcode = v_product.barcode;
  end loop;

  insert into public.shop_purchases(total, units, items)
    values (v_total, v_units, v_items)
    returning * into v_purchase;
  delete from public.shop_cart where id = 'current';
  return to_jsonb(v_purchase);
end;
$$;

revoke all on function public.record_shop_purchase(jsonb) from public, anon, authenticated;
grant execute on function public.record_shop_purchase(jsonb) to service_role;
