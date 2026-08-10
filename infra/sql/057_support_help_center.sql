create sequence if not exists support_ticket_reference_seq;
create table if not exists help_articles(
 id uuid primary key default gen_random_uuid(),slug text unique not null,title text not null,summary text,content text not null,
 category text not null,audience text not null default 'AGENCY',locale text not null default 'fr',status text not null default 'PUBLISHED',
 sort_order integer not null default 100,updated_at timestamptz not null default now(),created_at timestamptz not null default now()
);
create index if not exists idx_help_articles_search on help_articles using gin(to_tsvector('simple',coalesce(title,'')||' '||coalesce(summary,'')||' '||coalesce(content,'')));
insert into help_articles(slug,title,summary,content,category,sort_order) values
 ('premiers-pas','Bien démarrer avec Slaivio','Configurer votre agence et inviter votre équipe.','Complétez le profil de votre organisation, configurez les rôles, puis invitez les collaborateurs depuis Organisation et équipe.','DÉMARRAGE',10),
 ('creer-client-dossier','Créer un client et son dossier','Le flux recommandé pour une nouvelle demande cargo.','Créez le client, ouvrez ensuite un dossier et rattachez les colis, documents, paiements et expéditions à ce dossier.','OPÉRATIONS',20),
 ('reception-colis','Réceptionner et localiser un colis','Réception, contrôle, pesage et rangement.','Depuis Colis ou Entrepôts, identifiez le client, contrôlez le colis, enregistrez poids et dimensions puis affectez un emplacement physique.','ENTREPÔT',30),
 ('suivre-expedition','Suivre une expédition','Utiliser la tour de contrôle Tracking.','Le module Tracking consolide les événements des colis et expéditions. Les alertes signalent les ETA dépassées et incidents ouverts.','TRACKING',40),
 ('facturation-paiements','Factures et paiements','Émettre une facture et enregistrer un règlement.','Créez le document, vérifiez les lignes calculées par le serveur, émettez la facture puis enregistrez chaque paiement avec sa référence.','FINANCE',50)
on conflict(slug) do nothing;

create table if not exists support_tickets(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id) on delete cascade,
 ticket_reference text not null unique default ('SUP-'||to_char(now(),'YYYY')||'-'||lpad(nextval('support_ticket_reference_seq')::text,6,'0')),
 subject text not null,description text not null,category text not null,priority text not null default 'NORMAL',status text not null default 'OPEN',
 requester_id text not null,requester_name text,requester_email text,assigned_to text,assigned_name text,
 first_response_due_at timestamptz,resolution_due_at timestamptz,first_responded_at timestamptz,resolved_at timestamptz,closed_at timestamptz,
 row_version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(priority in('LOW','NORMAL','HIGH','URGENT')),check(status in('OPEN','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED','REOPENED'))
);
create index if not exists idx_support_tickets_org on support_tickets(org_id,status,updated_at desc);
create table if not exists support_ticket_messages(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id) on delete cascade,ticket_id uuid not null references support_tickets(id) on delete cascade,
 author_id text not null,author_name text,author_type text not null default 'CUSTOMER',message text not null,internal boolean not null default false,created_at timestamptz not null default now()
);
create table if not exists support_ticket_attachments(
 id uuid primary key default gen_random_uuid(),org_id text not null references organizations(id) on delete cascade,ticket_id uuid not null references support_tickets(id) on delete cascade,
 message_id uuid references support_ticket_messages(id) on delete cascade,object_path text not null,file_name text not null,mime_type text not null,size_bytes bigint not null,uploaded_by text not null,created_at timestamptz not null default now()
);
create table if not exists support_ticket_events(
 id bigserial primary key,org_id text not null references organizations(id) on delete cascade,ticket_id uuid not null references support_tickets(id) on delete cascade,
 event_type text not null,actor_id text,old_value text,new_value text,metadata jsonb not null default '{}',created_at timestamptz not null default now()
);
insert into permissions(permission_code,description) values
 ('support.read','Consulter le centre aide et les tickets'),('support.create','Créer et commenter un ticket'),
 ('support.close','Fermer ou rouvrir un ticket agence'),('support.export','Exporter les tickets support')
on conflict(permission_code) do update set description=excluded.description;
insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r join permissions p on p.permission_code in('support.read','support.create') on conflict do nothing;
insert into role_permissions(role_id,permission_id)
select r.id,p.id from organization_roles r join permissions p on p.permission_code in('support.close','support.export') where r.role_code in('OWNER','MANAGER') on conflict do nothing;
