import json
from sqlalchemy import text
from app.db.database import engine

def _rows(result): return [dict(x._mapping) for x in result]
def _audit(conn, org_id, actor, action, entity_type, entity_id, old=None, new=None):
    conn.execute(text("""insert into audit_logs(org_id,actor_id,entity_type,entity_id,action,old_data,new_data)
      values(:o,:a,:t,:i,:x,cast(:old as jsonb),cast(:new as jsonb))"""),
      {"o":org_id,"a":actor,"t":entity_type,"i":str(entity_id),"x":action,"old":json.dumps(old or {},default=str),"new":json.dumps(new or {},default=str)})

def overview(org_id):
    with engine.connect() as c:
        org=c.execute(text("select * from organizations where id=:o"),{"o":org_id}).mappings().first()
        settings=c.execute(text("select * from organization_settings where org_id=:o"),{"o":org_id}).mappings().first()
        members=_rows(c.execute(text("""select m.*,coalesce(r.role_name,m.role_code) role_name
          from organization_memberships m left join organization_roles r on r.org_id=m.org_id and r.role_code=m.role_code
          where m.org_id=:o order by case m.status when 'ACTIVE' then 0 else 1 end,m.created_at"""),{"o":org_id}))
        invitations=_rows(c.execute(text("select * from organization_invitations where org_id=:o order by created_at desc"),{"o":org_id}))
        roles=_rows(c.execute(text("""select r.*,count(rp.permission_id)::int permission_count,count(m.id)::int member_count
          from organization_roles r left join role_permissions rp on rp.role_id=r.id
          left join organization_memberships m on m.org_id=r.org_id and m.role_code=r.role_code and m.status='ACTIVE'
          where r.org_id=:o group by r.id order by r.system_role desc,r.role_name"""),{"o":org_id}))
        permissions=_rows(c.execute(text("select id,permission_code,description from permissions order by permission_code")))
        audit=_rows(c.execute(text("select * from audit_logs where org_id=:o order by created_at desc limit 100"),{"o":org_id}))
        return {"organization":dict(org) if org else None,"settings":dict(settings) if settings else None,"members":members,"invitations":invitations,"roles":roles,"permissions":permissions,"audit":audit}

def update_org(org_id, actor, data, version):
    allowed={'organization_name','legal_name','country','city','address','phone','email','website','registration_number','tax_number','logo_url'}
    values={k:v for k,v in data.items() if k in allowed}; sets=[f"{k}=:{k}" for k in values]
    if not sets:return overview(org_id)['organization']
    with engine.begin() as c:
        old=c.execute(text("select * from organizations where id=:o"),{"o":org_id}).mappings().first()
        row=c.execute(text(f"update organizations set {','.join(sets)},name=coalesce(:display_name,name),row_version=row_version+1,updated_at=now() where id=:o and row_version=:v returning *"),{"o":org_id,"v":version,"display_name":values.get('organization_name'),**values}).mappings().first()
        if not row: return None
        _audit(c,org_id,actor,'ORGANIZATION_UPDATED','organization',org_id,dict(old),dict(row)); return dict(row)

def save_settings(org_id,actor,data,version):
    allowed={'timezone','currency_code','country_code','language_code','date_format','weight_unit','volume_unit','notification_email','settings','security'}
    values={k:(json.dumps(v) if k in {'settings','security'} else v) for k,v in data.items() if k in allowed}
    with engine.begin() as c:
        c.execute(text("insert into organization_settings(org_id) values(:o) on conflict(org_id) do nothing"),{"o":org_id})
        sets=[f"{k}=cast(:{k} as jsonb)" if k in {'settings','security'} else f"{k}=:{k}" for k in values]
        row=c.execute(text(f"update organization_settings set {','.join(sets)},row_version=row_version+1,updated_at=now() where org_id=:o and row_version=:v returning *"),{"o":org_id,"v":version,**values}).mappings().first()
        if row:_audit(c,org_id,actor,'SETTINGS_UPDATED','organization_settings',org_id,new=data)
        return dict(row) if row else None

def update_member(org_id,member_id,actor,role_code,status,version):
    with engine.begin() as c:
        role=c.execute(text("select 1 from organization_roles where org_id=:o and role_code=:r"),{"o":org_id,"r":role_code}).first()
        if not role:return 'invalid_role'
        member=c.execute(text("select * from organization_memberships where id=:i and org_id=:o for update"),{"i":member_id,"o":org_id}).mappings().first()
        if not member:return 'missing'
        if member['role_code']=='OWNER' and (role_code!='OWNER' or status!='ACTIVE'):
            owners=c.execute(text("select count(*) from organization_memberships where org_id=:o and role_code='OWNER' and status='ACTIVE'"),{"o":org_id}).scalar_one()
            if owners<=1:return 'last_owner'
        row=c.execute(text("""update organization_memberships set role_code=:r,status=:s,suspended_at=case when :s='SUSPENDED' then now() else null end,row_version=row_version+1,updated_at=now()
          where id=:i and org_id=:o and row_version=:v returning *"""),{"r":role_code,"s":status,"i":member_id,"o":org_id,"v":version}).mappings().first()
        if not row:return 'conflict'
        _audit(c,org_id,actor,'MEMBER_UPDATED','membership',member_id,dict(member),dict(row));return dict(row)

def save_role(org_id,actor,data):
    with engine.begin() as c:
        role=c.execute(text("""insert into organization_roles(org_id,role_code,role_name,description,system_role)
          values(:o,:code,:name,:description,false) on conflict(org_id,role_code) do update set role_name=excluded.role_name,description=excluded.description returning *"""),{"o":org_id,**data}).mappings().one()
        c.execute(text("delete from role_permissions where role_id=:r"),{"r":role['id']})
        c.execute(text("""insert into role_permissions(role_id,permission_id) select :r,id from permissions where permission_code=any(:p) on conflict do nothing"""),{"r":role['id'],"p":data['permissions']})
        _audit(c,org_id,actor,'ROLE_SAVED','role',role['id'],new=data);return dict(role)

def revoke_invitation(org_id,invitation_id,actor):
    with engine.begin() as c:
        row=c.execute(text("update organization_invitations set status='REVOKED',revoked_at=now() where id=:i and org_id=:o and status='PENDING' returning *"),{"i":invitation_id,"o":org_id}).mappings().first()
        if row:_audit(c,org_id,actor,'INVITATION_REVOKED','invitation',invitation_id,new=dict(row))
        return dict(row) if row else None
