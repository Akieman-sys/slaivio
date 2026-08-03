-- Repair RBAC assignments from active organization memberships.
-- Membership is the tenant admission authority; assignments enable RBAC evaluation.
-- Safe to run more than once.

insert into user_role_assignments (user_id, org_id, role_id, assignment_status)
select m.clerk_user_id, m.org_id, r.id, 'ACTIVE'
from organization_memberships m
join organization_roles r
  on r.org_id = m.org_id
 and r.role_code = m.role_code
where m.status = 'ACTIVE'
on conflict (user_id, org_id, role_id)
do update set assignment_status = 'ACTIVE';

do $$
declare missing_count bigint;
begin
    select count(*) into missing_count
    from organization_memberships m
    where m.status = 'ACTIVE'
      and not exists (
          select 1 from organization_roles r
          where r.org_id = m.org_id and r.role_code = m.role_code
      );
    if missing_count > 0 then
        raise exception 'rbac invariant violation: % active membership(s) reference a missing organization role', missing_count;
    end if;
end $$;
