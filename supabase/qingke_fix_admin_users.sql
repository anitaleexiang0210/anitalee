-- 修复管理员用户列表查询中的 redeemed_at 字段歧义。
-- 已执行 qingke_schema.sql 的项目只需运行本文件一次；不删除用户或兑换码。
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
