-- 顷刻投标排版工具 V1：账号由 Supabase Auth 管理；本库只保存账号标识和兑换权益。
-- 在新建的 Supabase 项目 SQL Editor 中执行。不要把 secret/service_role key 放进网页。
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create table if not exists public.qingke_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  identifier text not null,
  kind text not null check (kind in ('email', 'phone')),
  created_at timestamptz not null default now()
);
create unique index if not exists qingke_profiles_identifier_key on public.qingke_profiles (lower(identifier));

create table if not exists public.qingke_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.qingke_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  suffix text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  redeemed_by uuid references public.qingke_profiles(user_id),
  redeemed_at timestamptz,
  revoked_at timestamptz,
  constraint qingke_code_binding_consistent check ((redeemed_by is null) = (redeemed_at is null))
);
create unique index if not exists qingke_one_active_code_per_user
  on public.qingke_codes(redeemed_by) where redeemed_by is not null and revoked_at is null;

alter table public.qingke_profiles enable row level security;
alter table public.qingke_admins enable row level security;
alter table public.qingke_codes enable row level security;
revoke all on public.qingke_profiles, public.qingke_admins, public.qingke_codes from public, anon, authenticated;

create or replace function private.qingke_create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null then
    if lower(new.email) ~ '^p[0-9]{8,15}@id\.qingke\.anitalee\.cn$' then
      insert into public.qingke_profiles(user_id, identifier, kind)
        values (new.id, '+' || substring(lower(new.email) from '^p([0-9]{8,15})@'), 'phone');
    else
      insert into public.qingke_profiles(user_id, identifier, kind)
        values (new.id, lower(new.email), 'email');
    end if;
  elsif new.phone is not null then
    insert into public.qingke_profiles(user_id, identifier, kind)
      values (new.id, new.phone, 'phone');
  else
    raise exception '顷刻账号必须使用邮箱或手机号';
  end if;
  return new;
end;
$$;
drop trigger if exists qingke_profile_on_signup on auth.users;
create trigger qingke_profile_on_signup after insert on auth.users
  for each row execute function private.qingke_create_profile();

create or replace function private.qingke_is_admin_impl()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.qingke_admins where user_id = auth.uid());
$$;

create or replace function private.qingke_my_account_impl()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  select jsonb_build_object(
    'identifier', p.identifier,
    'kind', p.kind,
    'redeemed_at', c.redeemed_at,
    'code_suffix', c.suffix,
    'active', coalesce(c.revoked_at is null and c.redeemed_at is not null, false),
    'is_admin', private.qingke_is_admin_impl()
  ) into result
  from public.qingke_profiles p
  left join lateral (
    select suffix, redeemed_at, revoked_at from public.qingke_codes
    where redeemed_by = p.user_id
    order by (revoked_at is null) desc, created_at desc limit 1
  ) c on true
  where p.user_id = auth.uid();
  if result is null then raise exception '账号信息尚未建立，请联系客服'; end if;
  return result;
end;
$$;

create or replace function private.qingke_bind_code_impl(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  normalized text;
  hashed text;
  redeemed uuid;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if exists(select 1 from public.qingke_codes where redeemed_by = auth.uid() and revoked_at is null) then
    return jsonb_build_object('status', 'already_active');
  end if;
  normalized := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if normalized !~ '^QK[0-9A-F]{24}$' then raise exception '兑换码格式不正确'; end if;
  hashed := encode(extensions.digest(convert_to(normalized, 'UTF8'), 'sha256'), 'hex');
  update public.qingke_codes
    set redeemed_by = auth.uid(), redeemed_at = now()
    where code_hash = hashed and redeemed_by is null and revoked_at is null
    returning id into redeemed;
  if redeemed is null then raise exception '兑换码无效或已绑定'; end if;
  return jsonb_build_object('status', 'bound');
end;
$$;

create or replace function private.qingke_admin_generate_codes_impl(p_count integer, p_note text)
returns table(code_id uuid, full_code text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  raw_hex text;
  normalized text;
begin
  if not private.qingke_is_admin_impl() then raise exception '无管理员权限'; end if;
  if p_count is null or p_count < 1 or p_count > 50 then raise exception '每次只能生成 1 至 50 枚兑换码'; end if;
  for i in 1..p_count loop
    raw_hex := upper(encode(extensions.gen_random_bytes(12), 'hex'));
    normalized := 'QK' || raw_hex;
    full_code := 'QK-' || substr(raw_hex, 1, 8) || '-' || substr(raw_hex, 9, 8) || '-' || substr(raw_hex, 17, 8);
    insert into public.qingke_codes as c(code_hash, suffix, note)
      values (encode(extensions.digest(convert_to(normalized, 'UTF8'), 'sha256'), 'hex'), right(raw_hex, 4), left(coalesce(p_note, ''), 120))
      returning c.id, c.created_at into code_id, created_at;
    return next;
  end loop;
end;
$$;

create or replace function private.qingke_admin_list_codes_impl()
returns table(code_id uuid, suffix text, created_at timestamptz, redeemed_at timestamptz, revoked_at timestamptz, identifier text, note text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.qingke_is_admin_impl() then raise exception '无管理员权限'; end if;
  return query
    select c.id, c.suffix, c.created_at, c.redeemed_at, c.revoked_at, p.identifier, c.note
    from public.qingke_codes c
    left join public.qingke_profiles p on p.user_id = c.redeemed_by
    order by c.created_at desc limit 1000;
end;
$$;

create or replace function private.qingke_admin_list_users_impl()
returns table(user_id uuid, identifier text, kind text, created_at timestamptz, code_suffix text, redeemed_at timestamptz, active boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.qingke_is_admin_impl() then raise exception '无管理员权限'; end if;
  return query
    select p.user_id, p.identifier, p.kind, p.created_at, c.suffix, c.redeemed_at,
      coalesce(c.revoked_at is null and c.redeemed_at is not null, false)
    from public.qingke_profiles p
    left join lateral (
      select qc.suffix, qc.redeemed_at, qc.revoked_at from public.qingke_codes qc
      where qc.redeemed_by = p.user_id
      order by (qc.revoked_at is null) desc, qc.created_at desc limit 1
    ) c on true
    order by p.created_at desc limit 1000;
end;
$$;

create or replace function private.qingke_admin_revoke_code_impl(p_code_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  affected uuid;
begin
  if not private.qingke_is_admin_impl() then raise exception '无管理员权限'; end if;
  update public.qingke_codes set revoked_at = now()
    where id = p_code_id and revoked_at is null returning id into affected;
  if affected is null then raise exception '兑换码不存在或已停用'; end if;
  return jsonb_build_object('status', 'revoked');
end;
$$;

-- exposed schema 只保留 invoker 包装；带提权能力的实现留在未暴露的 private schema。
create or replace function public.qingke_my_account() returns jsonb
  language sql security invoker set search_path = '' as $$ select private.qingke_my_account_impl(); $$;
create or replace function public.qingke_bind_code(p_code text) returns jsonb
  language sql security invoker set search_path = '' as $$ select private.qingke_bind_code_impl(p_code); $$;
create or replace function public.qingke_admin_generate_codes(p_count integer, p_note text)
  returns table(code_id uuid, full_code text, created_at timestamptz)
  language sql security invoker set search_path = '' as $$ select * from private.qingke_admin_generate_codes_impl(p_count, p_note); $$;
create or replace function public.qingke_admin_list_codes()
  returns table(code_id uuid, suffix text, created_at timestamptz, redeemed_at timestamptz, revoked_at timestamptz, identifier text, note text)
  language sql security invoker set search_path = '' as $$ select * from private.qingke_admin_list_codes_impl(); $$;
create or replace function public.qingke_admin_list_users()
  returns table(user_id uuid, identifier text, kind text, created_at timestamptz, code_suffix text, redeemed_at timestamptz, active boolean)
  language sql security invoker set search_path = '' as $$ select * from private.qingke_admin_list_users_impl(); $$;
create or replace function public.qingke_admin_revoke_code(p_code_id uuid) returns jsonb
  language sql security invoker set search_path = '' as $$ select private.qingke_admin_revoke_code_impl(p_code_id); $$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on function private.qingke_is_admin_impl() to authenticated;
grant execute on function private.qingke_my_account_impl() to authenticated;
grant execute on function private.qingke_bind_code_impl(text) to authenticated;
grant execute on function private.qingke_admin_generate_codes_impl(integer, text) to authenticated;
grant execute on function private.qingke_admin_list_codes_impl() to authenticated;
grant execute on function private.qingke_admin_list_users_impl() to authenticated;
grant execute on function private.qingke_admin_revoke_code_impl(uuid) to authenticated;
revoke execute on function public.qingke_my_account() from public, anon;
revoke execute on function public.qingke_bind_code(text) from public, anon;
revoke execute on function public.qingke_admin_generate_codes(integer, text) from public, anon;
revoke execute on function public.qingke_admin_list_codes() from public, anon;
revoke execute on function public.qingke_admin_list_users() from public, anon;
revoke execute on function public.qingke_admin_revoke_code(uuid) from public, anon;
grant execute on function public.qingke_my_account() to authenticated;
grant execute on function public.qingke_bind_code(text) to authenticated;
grant execute on function public.qingke_admin_generate_codes(integer, text) to authenticated;
grant execute on function public.qingke_admin_list_codes() to authenticated;
grant execute on function public.qingke_admin_list_users() to authenticated;
grant execute on function public.qingke_admin_revoke_code(uuid) to authenticated;
