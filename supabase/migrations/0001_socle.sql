-- AlerteRobot — socle : organisations, clients, moniteurs, incidents, alertes.
-- Règles de sécurité appliquées partout :
--   * RLS active sur chaque table, aucune table lisible par anon ;
--   * droits d'écriture accordés colonne par colonne (l'état, les quotas et les
--     jetons ne sont modifiables que par le moteur, en service_role) ;
--   * les fonctions security definer fixent search_path = '' et n'ouvrent
--     EXECUTE qu'aux rôles qui en ont besoin (PostgreSQL l'ouvre à PUBLIC).

-- Schéma dédié : le projet Supabase est partagé avec d'autres applications.
-- anon n'y a même pas l'usage ; authenticated et service_role le reçoivent plus bas.
create extension if not exists pgcrypto with schema extensions;
create schema alerterobot;
revoke all on schema alerterobot from public;

-- ---------------------------------------------------------------- Types

create type alerterobot.role_membre as enum ('proprietaire', 'admin', 'membre', 'lecteur');
create type alerterobot.forfait as enum ('decouverte', 'essentiel', 'pro', 'agence');
create type alerterobot.type_moniteur as enum ('http', 'mot_cle', 'api', 'paiement', 'heartbeat');
create type alerterobot.etat_moniteur as enum ('inconnu', 'ok', 'lent', 'suspect', 'panne');
create type alerterobot.lieu as enum ('abidjan', 'paris');
create type alerterobot.canal as enum ('email', 'push');
create type alerterobot.type_notification as enum ('panne', 'rappel', 'escalade', 'retabli', 'lenteur', 'ssl');
create type alerterobot.statut_notification as enum ('a_envoyer', 'envoi', 'envoyee', 'echec', 'ignoree');

-- ---------------------------------------------------------------- Tables

create table alerterobot.organisations (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(nom) between 2 and 80),
  forfait alerterobot.forfait not null default 'decouverte',
  moniteurs_max int not null default 1,
  intervalle_min_s int not null default 300,
  contacts_max int not null default 1,
  rappel_min int not null default 15 check (rappel_min in (15, 30)),
  escalade_min int not null default 30 check (escalade_min between 10 and 240),
  silence_debut time,
  silence_fin time,
  fuseau text not null default 'Africa/Abidjan',
  cree_le timestamptz not null default now()
);

create table alerterobot.membres (
  org_id uuid not null references alerterobot.organisations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role alerterobot.role_membre not null,
  cree_le timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index membres_user on alerterobot.membres (user_id);

-- Clients d'une agence. Une organisation sans mode agence n'en a qu'un, implicite (client_id null).
create table alerterobot.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references alerterobot.organisations on delete cascade,
  nom text not null check (char_length(nom) between 2 and 80),
  -- Adresse de la page de statut publique ; null = pas de page.
  slug_statut text unique check (slug_statut ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  cree_le timestamptz not null default now(),
  unique (id, org_id)
);
create index clients_org on alerterobot.clients (org_id);

create table alerterobot.moniteurs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references alerterobot.organisations on delete cascade,
  client_id uuid,
  nom text not null check (char_length(nom) between 2 and 80),
  type alerterobot.type_moniteur not null,
  url text check (url is null or (char_length(url) <= 2048 and url ~ '^https?://')),
  mot_cle text check (mot_cle is null or char_length(mot_cle) between 1 and 200),
  champ_json text check (champ_json is null or champ_json ~ '^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+){0,9}$'),
  seuil_lent_ms int not null default 2000 check (seuil_lent_ms between 100 and 30000),
  delai_ms int not null default 30000 check (delai_ms between 1000 and 30000),
  intervalle_s int not null default 300 check (intervalle_s between 60 and 3600),
  critique boolean not null default true,
  public boolean not null default false,
  actif boolean not null default true,
  -- Tenu par le moteur uniquement.
  etat alerterobot.etat_moniteur not null default 'inconnu',
  etat_depuis timestamptz not null default now(),
  suspect_lieu alerterobot.lieu,
  suspect_depuis timestamptz,
  derniere_verif timestamptz,
  dernier_ms int,
  ssl_expire_le timestamptz,
  heartbeat_jeton_hash bytea unique,
  heartbeat_periode_s int check (heartbeat_periode_s is null or heartbeat_periode_s between 60 and 2678400),
  heartbeat_grace_s int not null default 1800 check (heartbeat_grace_s between 60 and 86400),
  dernier_signal timestamptz,
  cree_le timestamptz not null default now(),
  foreign key (client_id, org_id) references alerterobot.clients (id, org_id) on delete cascade,
  check ((type = 'heartbeat') = (url is null)),
  check (type <> 'heartbeat' or heartbeat_periode_s is not null),
  check (type <> 'mot_cle' or mot_cle is not null),
  unique (id, org_id)
);
create index moniteurs_org on alerterobot.moniteurs (org_id);

-- File de planification : une ligne par moniteur et par lieu de vérification.
create table alerterobot.planning (
  moniteur_id uuid not null references alerterobot.moniteurs on delete cascade,
  lieu alerterobot.lieu not null,
  prochaine_le timestamptz not null default now(),
  verrou_jusqu timestamptz,
  primary key (moniteur_id, lieu)
);
create index planning_du on alerterobot.planning (lieu, prochaine_le);

create table alerterobot.verifications (
  id bigint generated always as identity primary key,
  moniteur_id uuid not null references alerterobot.moniteurs on delete cascade,
  lieu alerterobot.lieu not null,
  le timestamptz not null default now(),
  ok boolean not null,
  lent boolean not null default false,
  code int,
  ms int,
  erreur text check (erreur is null or char_length(erreur) <= 300)
);
create index verifications_moniteur on alerterobot.verifications (moniteur_id, le desc);

create table alerterobot.incidents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references alerterobot.organisations on delete cascade,
  moniteur_id uuid not null,
  debut timestamptz not null,
  confirme_le timestamptz not null default now(),
  fin timestamptz,
  cause text check (cause is null or char_length(cause) <= 300),
  lieux text not null,
  en_maintenance boolean not null default false,
  vu_le timestamptz,
  vu_par text,
  escalade_niveau int not null default 1,
  derniere_relance timestamptz,
  foreign key (moniteur_id, org_id) references alerterobot.moniteurs (id, org_id) on delete cascade
);
create unique index incidents_un_ouvert on alerterobot.incidents (moniteur_id) where fin is null;
create index incidents_org on alerterobot.incidents (org_id, debut desc);

create table alerterobot.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references alerterobot.organisations on delete cascade,
  nom text not null check (char_length(nom) between 2 and 80),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  -- Membre qui reçoit les notifications push de ce contact.
  user_id uuid references auth.users on delete set null,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  check (email is not null or user_id is not null),
  unique (id, org_id)
);
create index contacts_org on alerterobot.contacts (org_id);

create table alerterobot.moniteur_contacts (
  org_id uuid not null,
  moniteur_id uuid not null,
  contact_id uuid not null,
  ordre int not null default 1 check (ordre between 1 and 5),
  primary key (moniteur_id, contact_id),
  foreign key (moniteur_id, org_id) references alerterobot.moniteurs (id, org_id) on delete cascade,
  foreign key (contact_id, org_id) references alerterobot.contacts (id, org_id) on delete cascade
);

create table alerterobot.maintenances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references alerterobot.organisations on delete cascade,
  moniteur_id uuid,
  debut timestamptz not null,
  fin timestamptz not null,
  motif text check (motif is null or char_length(motif) <= 200),
  check (fin > debut and fin - debut <= interval '7 days'),
  foreign key (moniteur_id, org_id) references alerterobot.moniteurs (id, org_id) on delete cascade
);
create index maintenances_org on alerterobot.maintenances (org_id, fin);

create table alerterobot.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references alerterobot.organisations on delete cascade,
  incident_id uuid references alerterobot.incidents on delete cascade,
  moniteur_id uuid not null references alerterobot.moniteurs on delete cascade,
  contact_id uuid not null references alerterobot.contacts on delete cascade,
  canal alerterobot.canal not null,
  type alerterobot.type_notification not null,
  statut alerterobot.statut_notification not null default 'a_envoyer',
  envoyer_apres timestamptz not null default now(),
  tentatives int not null default 0,
  verrou_jusqu timestamptz,
  envoye_le timestamptz,
  erreur text,
  cree_le timestamptz not null default now()
);
create index notifications_a_envoyer on alerterobot.notifications (envoyer_apres) where statut = 'a_envoyer';
create index notifications_org on alerterobot.notifications (org_id, cree_le desc);

-- Abonnements Web Push d'un utilisateur (un par navigateur ou téléphone).
create table alerterobot.abonnements_push (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  cree_le timestamptz not null default now()
);
create index abonnements_push_user on alerterobot.abonnements_push (user_id);

-- Jetons « J'ai vu » envoyés par email et push : seul le hash est stocké.
create table alerterobot.jetons_vu (
  jeton_hash bytea primary key,
  incident_id uuid not null references alerterobot.incidents on delete cascade,
  contact_id uuid not null references alerterobot.contacts on delete cascade,
  expire_le timestamptz not null,
  utilise_le timestamptz
);

create table alerterobot.journal_audit (
  id bigint generated always as identity primary key,
  org_id uuid references alerterobot.organisations on delete cascade,
  user_id uuid,
  action text not null,
  cible text,
  details jsonb not null default '{}',
  le timestamptz not null default now()
);
create index journal_audit_org on alerterobot.journal_audit (org_id, le desc);

-- Limiteur de débit à fenêtre fixe (heartbeat, « J'ai vu », création de compte).
create table alerterobot.limites (
  cle text not null,
  fenetre timestamptz not null,
  compte int not null default 0,
  primary key (cle, fenetre)
);

-- ---------------------------------------------------------------- Aides d'autorisation

-- coalesce : une autorisation inconnue vaut « non », jamais NULL.
create function alerterobot.est_membre(p_org uuid, p_roles alerterobot.role_membre[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select true from alerterobot.membres m
    where m.org_id = p_org and m.user_id = auth.uid()
      and (p_roles is null or m.role = any (p_roles))
  ), false);
$$;

create function alerterobot.peut_ecrire(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select alerterobot.est_membre(p_org, array['proprietaire', 'admin', 'membre']::alerterobot.role_membre[]);
$$;

create function alerterobot.peut_gerer(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select alerterobot.est_membre(p_org, array['proprietaire', 'admin']::alerterobot.role_membre[]);
$$;

-- ---------------------------------------------------------------- RLS

alter table alerterobot.organisations enable row level security;
alter table alerterobot.membres enable row level security;
alter table alerterobot.clients enable row level security;
alter table alerterobot.moniteurs enable row level security;
alter table alerterobot.planning enable row level security;
alter table alerterobot.verifications enable row level security;
alter table alerterobot.incidents enable row level security;
alter table alerterobot.contacts enable row level security;
alter table alerterobot.moniteur_contacts enable row level security;
alter table alerterobot.maintenances enable row level security;
alter table alerterobot.notifications enable row level security;
alter table alerterobot.abonnements_push enable row level security;
alter table alerterobot.jetons_vu enable row level security;
alter table alerterobot.journal_audit enable row level security;
alter table alerterobot.limites enable row level security;

create policy lire on alerterobot.organisations for select to authenticated using (alerterobot.est_membre(id));
create policy modifier on alerterobot.organisations for update to authenticated using (alerterobot.peut_gerer(id)) with check (alerterobot.peut_gerer(id));

create policy lire on alerterobot.membres for select to authenticated using (alerterobot.est_membre(org_id));

create policy lire on alerterobot.clients for select to authenticated using (alerterobot.est_membre(org_id));
create policy creer on alerterobot.clients for insert to authenticated with check (alerterobot.peut_gerer(org_id));
create policy modifier on alerterobot.clients for update to authenticated using (alerterobot.peut_gerer(org_id)) with check (alerterobot.peut_gerer(org_id));
create policy supprimer on alerterobot.clients for delete to authenticated using (alerterobot.peut_gerer(org_id));

create policy lire on alerterobot.moniteurs for select to authenticated using (alerterobot.est_membre(org_id));
create policy creer on alerterobot.moniteurs for insert to authenticated with check (alerterobot.peut_ecrire(org_id));
create policy modifier on alerterobot.moniteurs for update to authenticated using (alerterobot.peut_ecrire(org_id)) with check (alerterobot.peut_ecrire(org_id));
create policy supprimer on alerterobot.moniteurs for delete to authenticated using (alerterobot.peut_ecrire(org_id));

create policy lire on alerterobot.verifications for select to authenticated
  using (exists (select 1 from alerterobot.moniteurs m where m.id = moniteur_id and alerterobot.est_membre(m.org_id)));

create policy lire on alerterobot.incidents for select to authenticated using (alerterobot.est_membre(org_id));

create policy lire on alerterobot.contacts for select to authenticated using (alerterobot.est_membre(org_id));
create policy creer on alerterobot.contacts for insert to authenticated with check (alerterobot.peut_gerer(org_id));
create policy modifier on alerterobot.contacts for update to authenticated using (alerterobot.peut_gerer(org_id)) with check (alerterobot.peut_gerer(org_id));
create policy supprimer on alerterobot.contacts for delete to authenticated using (alerterobot.peut_gerer(org_id));

create policy lire on alerterobot.moniteur_contacts for select to authenticated using (alerterobot.est_membre(org_id));
create policy creer on alerterobot.moniteur_contacts for insert to authenticated with check (alerterobot.peut_ecrire(org_id));
create policy modifier on alerterobot.moniteur_contacts for update to authenticated using (alerterobot.peut_ecrire(org_id)) with check (alerterobot.peut_ecrire(org_id));
create policy supprimer on alerterobot.moniteur_contacts for delete to authenticated using (alerterobot.peut_ecrire(org_id));

create policy lire on alerterobot.maintenances for select to authenticated using (alerterobot.est_membre(org_id));
create policy creer on alerterobot.maintenances for insert to authenticated with check (alerterobot.peut_ecrire(org_id));
create policy supprimer on alerterobot.maintenances for delete to authenticated using (alerterobot.peut_ecrire(org_id));

create policy lire on alerterobot.notifications for select to authenticated using (alerterobot.est_membre(org_id));

create policy lire on alerterobot.abonnements_push for select to authenticated using (user_id = auth.uid());
create policy supprimer on alerterobot.abonnements_push for delete to authenticated using (user_id = auth.uid());

create policy lire on alerterobot.journal_audit for select to authenticated using (alerterobot.peut_gerer(org_id));

-- planning, jetons_vu, limites : aucune politique, donc aucun accès hors service_role.

-- ---------------------------------------------------------------- Droits

revoke all on all tables in schema alerterobot from anon, authenticated;
revoke all on all sequences in schema alerterobot from anon, authenticated;
alter default privileges in schema alerterobot revoke all on tables from anon, authenticated;
alter default privileges in schema alerterobot revoke all on sequences from anon, authenticated;
alter default privileges in schema alerterobot revoke execute on functions from public, anon, authenticated;

-- Hors du schéma public, Supabase ne donne rien d'office à service_role (workers, serveur).
grant usage on schema alerterobot to authenticated, service_role;
grant all on all tables in schema alerterobot to service_role;
grant all on all sequences in schema alerterobot to service_role;
alter default privileges in schema alerterobot grant all on tables to service_role;
alter default privileges in schema alerterobot grant all on sequences to service_role;

grant select on alerterobot.organisations, alerterobot.membres, alerterobot.clients, alerterobot.moniteurs,
  alerterobot.verifications, alerterobot.incidents, alerterobot.contacts, alerterobot.moniteur_contacts,
  alerterobot.maintenances, alerterobot.notifications, alerterobot.abonnements_push, alerterobot.journal_audit
  to authenticated;

grant update (nom, rappel_min, escalade_min, silence_debut, silence_fin, fuseau) on alerterobot.organisations to authenticated;
grant insert (org_id, nom, slug_statut), update (nom, slug_statut), delete on alerterobot.clients to authenticated;
grant insert (org_id, client_id, nom, type, url, mot_cle, champ_json, seuil_lent_ms, delai_ms, intervalle_s, critique, public, actif, heartbeat_periode_s, heartbeat_grace_s),
  update (client_id, nom, url, mot_cle, champ_json, seuil_lent_ms, delai_ms, intervalle_s, critique, public, actif, heartbeat_periode_s, heartbeat_grace_s),
  delete on alerterobot.moniteurs to authenticated;
grant insert (org_id, nom, email, user_id), update (nom, email, user_id, actif), delete on alerterobot.contacts to authenticated;
grant insert (org_id, moniteur_id, contact_id, ordre), update (ordre), delete on alerterobot.moniteur_contacts to authenticated;
grant insert (org_id, moniteur_id, debut, fin, motif), delete on alerterobot.maintenances to authenticated;
grant delete on alerterobot.abonnements_push to authenticated;

revoke execute on function alerterobot.est_membre(uuid, alerterobot.role_membre[]) from public, anon;
revoke execute on function alerterobot.peut_ecrire(uuid) from public, anon;
revoke execute on function alerterobot.peut_gerer(uuid) from public, anon;
grant execute on function alerterobot.est_membre(uuid, alerterobot.role_membre[]) to authenticated, service_role;
grant execute on function alerterobot.peut_ecrire(uuid) to authenticated, service_role;
grant execute on function alerterobot.peut_gerer(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- Garde-fous des écritures

-- Quotas du forfait et cohérence des moniteurs. Les valeurs viennent de
-- l'organisation, que l'utilisateur ne peut pas modifier lui-même.
create function alerterobot.verifier_moniteur() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org alerterobot.organisations;
  v_nb int;
begin
  select * into v_org from alerterobot.organisations where id = new.org_id;
  if tg_op = 'INSERT' then
    select count(*) into v_nb from alerterobot.moniteurs where org_id = new.org_id;
    if v_nb >= v_org.moniteurs_max then
      raise exception 'Quota atteint : % moniteurs pour ce forfait.', v_org.moniteurs_max using errcode = 'P0001';
    end if;
  end if;
  if new.intervalle_s < v_org.intervalle_min_s then
    new.intervalle_s := v_org.intervalle_min_s;
  end if;
  if new.type in ('api', 'paiement', 'heartbeat') and v_org.forfait in ('decouverte', 'essentiel') then
    raise exception 'Ce type de vérification demande le forfait Pro.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger verifier_moniteur before insert or update of intervalle_s, type on alerterobot.moniteurs
  for each row execute function alerterobot.verifier_moniteur();

-- Chaque moniteur web a une ligne de planning par lieu ; un heartbeat reçoit son jeton.
create function alerterobot.apres_creation_moniteur() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.type <> 'heartbeat' then
    insert into alerterobot.planning (moniteur_id, lieu) values (new.id, 'abidjan'), (new.id, 'paris');
  end if;
  return new;
end;
$$;
create trigger apres_creation_moniteur after insert on alerterobot.moniteurs
  for each row execute function alerterobot.apres_creation_moniteur();

create function alerterobot.verifier_contact() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_max int; v_nb int;
begin
  if tg_op = 'INSERT' then
    select contacts_max into v_max from alerterobot.organisations where id = new.org_id;
    select count(*) into v_nb from alerterobot.contacts where org_id = new.org_id;
    if v_nb >= v_max then
      raise exception 'Quota atteint : % contacts pour ce forfait.', v_max using errcode = 'P0001';
    end if;
  end if;
  -- Un contact push doit désigner un membre de la même organisation.
  if new.user_id is not null and not exists (
    select 1 from alerterobot.membres where org_id = new.org_id and user_id = new.user_id) then
    raise exception 'Ce contact n''est pas membre de l''organisation.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger verifier_contact before insert or update of user_id on alerterobot.contacts
  for each row execute function alerterobot.verifier_contact();

revoke execute on function alerterobot.verifier_moniteur() from public, anon, authenticated;
revoke execute on function alerterobot.apres_creation_moniteur() from public, anon, authenticated;
revoke execute on function alerterobot.verifier_contact() from public, anon, authenticated;
