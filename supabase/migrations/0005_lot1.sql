-- AlerteRobot — lot 1, inspiré des plateformes de référence :
--   1. chronologie d'incident avec mises à jour publiques (Statuspage, Instatus)
--      et abonnés email de la page de statut, en double opt-in ;
--   2. capture de l'erreur constatée par chaque sonde (Better Stack) ;
--   3. maintenances programmées annoncées sur la page de statut ;
--   4. escalade et astreinte : niveau et jours de garde de chaque contact.

-- ---------------------------------------------------------------- 1. Chronologie

alter table alerterobot.incidents add constraint incidents_id_org unique (id, org_id);

create type alerterobot.etape_incident as enum ('analyse', 'identifie', 'surveillance', 'resolu');

create table alerterobot.incident_maj (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  incident_id uuid not null,
  etape alerterobot.etape_incident not null,
  message text not null check (char_length(message) between 1 and 1000),
  publique boolean not null default true,
  auteur text not null,
  cree_le timestamptz not null default now(),
  foreign key (incident_id, org_id) references alerterobot.incidents (id, org_id) on delete cascade
);
create index incident_maj_incident on alerterobot.incident_maj (incident_id, cree_le);
alter table alerterobot.incident_maj enable row level security;
create policy lire on alerterobot.incident_maj for select to authenticated using (alerterobot.est_membre(org_id));
grant select on alerterobot.incident_maj to authenticated;
grant all on alerterobot.incident_maj to service_role;

-- Abonnés email d'une page de statut. Confirmés par un lien signé (double opt-in).
create table alerterobot.abonnes_statut (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references alerterobot.clients on delete cascade,
  email text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  confirme_le timestamptz,
  cree_le timestamptz not null default now()
);
create unique index abonnes_statut_unique on alerterobot.abonnes_statut (client_id, lower(email));
alter table alerterobot.abonnes_statut enable row level security;
grant all on alerterobot.abonnes_statut to service_role;

-- File des emails aux abonnés (mises à jour d'incident, maintenances annoncées).
create table alerterobot.envois_abonnes (
  id uuid primary key default gen_random_uuid(),
  abonne_id uuid not null references alerterobot.abonnes_statut on delete cascade,
  sujet text not null,
  corps text not null,
  statut alerterobot.statut_notification not null default 'a_envoyer',
  tentatives int not null default 0,
  verrou_jusqu timestamptz,
  envoye_le timestamptz,
  erreur text,
  cree_le timestamptz not null default now()
);
create index envois_abonnes_a_envoyer on alerterobot.envois_abonnes (cree_le) where statut = 'a_envoyer';
alter table alerterobot.envois_abonnes enable row level security;
grant all on alerterobot.envois_abonnes to service_role;

-- Chaque incident ouvre et ferme sa chronologie tout seul, en langage clair.
create function alerterobot._chronologie_auto() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_nom text;
begin
  select nom into v_nom from alerterobot.moniteurs where id = new.moniteur_id;
  if tg_op = 'INSERT' then
    insert into alerterobot.incident_maj (org_id, incident_id, etape, message, publique, auteur)
    values (new.org_id, new.id, 'analyse',
      format('Nous constatons une interruption de « %s ». L''équipe technique est prévenue et analyse la situation.', v_nom),
      not new.en_maintenance, 'AlerteRobot');
  elsif new.fin is not null and old.fin is null then
    insert into alerterobot.incident_maj (org_id, incident_id, etape, message, publique, auteur)
    values (new.org_id, new.id, 'resolu',
      format('« %s » fonctionne de nouveau. Merci de votre patience.', v_nom),
      not new.en_maintenance, 'AlerteRobot');
  end if;
  return new;
end;
$$;
create trigger chronologie_auto after insert or update of fin on alerterobot.incidents
  for each row execute function alerterobot._chronologie_auto();

-- Une mise à jour publique part aussi par email aux abonnés confirmés de la page concernée.
create function alerterobot._annoncer_maj() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.publique then
    return new;
  end if;
  insert into alerterobot.envois_abonnes (abonne_id, sujet, corps)
  select a.id,
    case new.etape when 'resolu' then '[Résolu] ' when 'analyse' then '[Incident] ' else '[Mise à jour] ' end || m.nom || ' · ' || cl.nom,
    new.message
  from alerterobot.incidents i
  join alerterobot.moniteurs m on m.id = i.moniteur_id and m.public
  join alerterobot.clients cl on cl.id = m.client_id and cl.slug_statut is not null
  join alerterobot.abonnes_statut a on a.client_id = cl.id and a.confirme_le is not null
  where i.id = new.incident_id and not i.en_maintenance;
  return new;
end;
$$;
create trigger annoncer_maj after insert on alerterobot.incident_maj
  for each row execute function alerterobot._annoncer_maj();

-- Mise à jour écrite par un membre depuis la page de l'incident.
create function alerterobot.publier_maj(p_incident uuid, p_etape alerterobot.etape_incident, p_message text, p_publique boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_inc alerterobot.incidents;
  v_auteur text;
  v_id uuid;
begin
  select * into v_inc from alerterobot.incidents where id = p_incident;
  if not found or not alerterobot.peut_ecrire(v_inc.org_id) then
    raise exception 'Incident introuvable.' using errcode = '42501';
  end if;
  select coalesce(c.nom, split_part(u.email, '@', 1)) into v_auteur
  from auth.users u left join alerterobot.contacts c on c.user_id = u.id and c.org_id = v_inc.org_id
  where u.id = auth.uid();
  insert into alerterobot.incident_maj (org_id, incident_id, etape, message, publique, auteur)
  values (v_inc.org_id, p_incident, p_etape, trim(p_message), coalesce(p_publique, true), coalesce(v_auteur, 'Membre'))
  returning id into v_id;
  perform alerterobot._journal(v_inc.org_id, 'maj_incident', p_incident::text, jsonb_build_object('etape', p_etape, 'publique', p_publique));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- 2. Capture de l'erreur

alter table alerterobot.verifications add column details jsonb
  check (details is null or pg_column_size(details) <= 4000);

drop function alerterobot.enregistrer_verification(uuid, alerterobot.lieu, boolean, int, int, text, timestamptz);

create function alerterobot.enregistrer_verification(
  p_moniteur uuid, p_lieu alerterobot.lieu, p_ok boolean, p_code int, p_ms int, p_erreur text,
  p_ssl_expire timestamptz default null, p_details jsonb default null)
returns alerterobot.etat_moniteur language plpgsql security definer set search_path = '' as $$
declare
  v_m alerterobot.moniteurs;
  v_lent boolean;
  v_etat alerterobot.etat_moniteur;
  v_maint boolean;
  v_inc uuid;
  v_jours numeric;
  v_palier int;
begin
  select * into v_m from alerterobot.moniteurs where id = p_moniteur for update;
  if not found then
    return null;
  end if;
  v_lent := p_ok and p_ms is not null and p_ms > v_m.seuil_lent_ms;
  v_maint := alerterobot._en_maintenance(p_moniteur);

  insert into alerterobot.verifications (moniteur_id, lieu, ok, lent, code, ms, erreur, details)
  values (p_moniteur, p_lieu, p_ok, v_lent, p_code, p_ms, left(p_erreur, 300),
          case when pg_column_size(p_details) <= 4000 then p_details end);

  update alerterobot.planning
  set prochaine_le = now() + make_interval(secs => v_m.intervalle_s), verrou_jusqu = null
  where moniteur_id = p_moniteur and lieu = p_lieu;

  if p_ok then
    v_etat := case when v_lent then 'lent' else 'ok' end;
    if v_m.etat = 'panne' then
      perform alerterobot._clore_incident(p_moniteur);
    elsif v_m.etat = 'suspect' then
      perform alerterobot._journal(v_m.org_id, 'faux_positif_evite', p_moniteur::text,
        jsonb_build_object('lieu_echec', v_m.suspect_lieu, 'lieu_succes', p_lieu));
    elsif v_etat = 'lent' and v_m.etat = 'ok' and not v_maint
      and not exists (select 1 from alerterobot.notifications
                      where moniteur_id = p_moniteur and type = 'lenteur' and cree_le > now() - interval '6 hours') then
      perform alerterobot._planifier_notifications(null, p_moniteur, 'lenteur', 1, 1);
    end if;
  else
    if v_m.etat in ('inconnu', 'ok', 'lent') then
      v_etat := 'suspect';
      update alerterobot.planning set prochaine_le = now()
      where moniteur_id = p_moniteur and lieu <> p_lieu;
    elsif v_m.etat = 'suspect' then
      if p_lieu <> v_m.suspect_lieu or now() - v_m.suspect_depuis >= interval '3 minutes' then
        v_etat := 'panne';
        insert into alerterobot.incidents (org_id, moniteur_id, debut, cause, lieux, en_maintenance, derniere_relance)
        values (v_m.org_id, p_moniteur, v_m.suspect_depuis, left(p_erreur, 300),
                case when p_lieu <> v_m.suspect_lieu then 'abidjan,paris' else p_lieu::text end,
                v_maint, now())
        returning id into v_inc;
        if not v_maint then
          perform alerterobot._planifier_notifications(v_inc, p_moniteur, 'panne', 1, 1);
        end if;
      else
        v_etat := 'suspect';
        update alerterobot.planning set prochaine_le = now()
        where moniteur_id = p_moniteur and lieu <> p_lieu;
      end if;
    else
      v_etat := 'panne';
    end if;
  end if;

  -- Certificat : alerte aux paliers de 30, 7 et 1 jour, une fois par palier.
  if p_ssl_expire is not null then
    v_jours := extract(epoch from p_ssl_expire - now()) / 86400;
    v_palier := case when v_jours <= 1 then 1 when v_jours <= 7 then 7 when v_jours <= 30 then 30 end;
    if v_palier is null then
      v_m.ssl_palier_notifie := null;
    elsif v_m.ssl_palier_notifie is null or v_palier < v_m.ssl_palier_notifie then
      perform alerterobot._planifier_notifications(null, p_moniteur, 'ssl', 1, 1);
      v_m.ssl_palier_notifie := v_palier;
    end if;
  end if;

  update alerterobot.moniteurs set
    etat = v_etat,
    etat_depuis = case when v_etat <> v_m.etat then now() else v_m.etat_depuis end,
    suspect_lieu = case when v_etat = 'suspect' then coalesce(v_m.suspect_lieu, p_lieu) end,
    suspect_depuis = case when v_etat = 'suspect' then coalesce(v_m.suspect_depuis, now()) end,
    derniere_verif = now(),
    dernier_ms = case when p_ok then p_ms else v_m.dernier_ms end,
    ssl_expire_le = coalesce(p_ssl_expire, v_m.ssl_expire_le),
    ssl_palier_notifie = v_m.ssl_palier_notifie
  where id = p_moniteur;
  return v_etat;
end;
$$;

-- ---------------------------------------------------------------- 3. Maintenances annoncées

alter table alerterobot.maintenances add column publique boolean not null default true;
grant insert (publique) on alerterobot.maintenances to authenticated;

create function alerterobot._annoncer_maintenance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_quand text;
begin
  if not new.publique or new.debut <= now() then
    return new;
  end if;
  v_quand := format('le %s de %s à %s (heure d''Abidjan)',
    to_char(new.debut at time zone 'Africa/Abidjan', 'DD/MM'),
    to_char(new.debut at time zone 'Africa/Abidjan', 'HH24:MI'),
    to_char(new.fin at time zone 'Africa/Abidjan', 'HH24:MI'));
  insert into alerterobot.envois_abonnes (abonne_id, sujet, corps)
  select a.id, '[Maintenance prévue] ' || cl.nom,
    format('Une maintenance est prévue %s%s. %s', v_quand,
      case when m.nom is not null then format(' sur « %s »', m.nom) else '' end,
      coalesce(nullif(trim(new.motif), '') || '.', 'Le service pourra être brièvement indisponible.'))
  from alerterobot.clients cl
  left join alerterobot.moniteurs m on m.id = new.moniteur_id
  join alerterobot.abonnes_statut a on a.client_id = cl.id and a.confirme_le is not null
  where cl.org_id = new.org_id and cl.slug_statut is not null
    and (new.moniteur_id is null or (m.client_id = cl.id and m.public));
  return new;
end;
$$;
create trigger annoncer_maintenance after insert on alerterobot.maintenances
  for each row execute function alerterobot._annoncer_maintenance();

-- ---------------------------------------------------------------- 4. Escalade et astreinte

alter table alerterobot.contacts
  add column niveau int not null default 1 check (niveau between 1 and 5),
  add column astreinte_jours smallint[] not null default '{1,2,3,4,5,6,7}'
    check (astreinte_jours <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(astreinte_jours) >= 1);
grant insert (niveau, astreinte_jours), update (niveau, astreinte_jours) on alerterobot.contacts to authenticated;

-- Jour ISO (1 = lundi) dans le fuseau de l'organisation.
create function alerterobot._de_garde(p_jours smallint[], p_fuseau text) returns boolean
language sql stable set search_path = '' as $$
  select extract(isodow from now() at time zone p_fuseau)::smallint = any (p_jours);
$$;

-- Le niveau d'un contact s'applique à tous les moniteurs de l'organisation.
create function alerterobot._lier_contact() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into alerterobot.moniteur_contacts (org_id, moniteur_id, contact_id, ordre)
  select new.org_id, m.id, new.id, new.niveau from alerterobot.moniteurs m where m.org_id = new.org_id
  on conflict (moniteur_id, contact_id) do update set ordre = excluded.ordre;
  return new;
end;
$$;
create trigger lier_contact after insert or update of niveau on alerterobot.contacts
  for each row execute function alerterobot._lier_contact();

-- Un nouveau moniteur prévient tous les contacts, chacun à son niveau.
create or replace function alerterobot.apres_creation_moniteur() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.type <> 'heartbeat' then
    insert into alerterobot.planning (moniteur_id, lieu) values (new.id, 'abidjan'), (new.id, 'paris');
  end if;
  insert into alerterobot.moniteur_contacts (org_id, moniteur_id, contact_id, ordre)
  select new.org_id, new.id, c.id, c.niveau from alerterobot.contacts c where c.org_id = new.org_id
  on conflict (moniteur_id, contact_id) do nothing;
  return new;
end;
$$;

-- Rattrapage : tous les moniteurs existants préviennent tous les contacts de leur organisation.
insert into alerterobot.moniteur_contacts (org_id, moniteur_id, contact_id, ordre)
select m.org_id, m.id, c.id, c.niveau
from alerterobot.moniteurs m join alerterobot.contacts c on c.org_id = m.org_id
on conflict (moniteur_id, contact_id) do nothing;

-- Envois : seuls les contacts de garde aujourd'hui. Si personne n'est de garde au
-- niveau demandé, l'alerte passe au premier niveau suivant où quelqu'un l'est.
create or replace function alerterobot._planifier_notifications(
  p_incident uuid, p_moniteur uuid, p_type alerterobot.type_notification, p_ordre_min int, p_ordre_max int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_m alerterobot.moniteurs;
  v_fuseau text;
  v_apres timestamptz;
  v_min int := p_ordre_min;
  v_max int := p_ordre_max;
  v_premier int;
  v_nb int := 0;
  v_c record;
begin
  select * into v_m from alerterobot.moniteurs where id = p_moniteur;
  select fuseau into v_fuseau from alerterobot.organisations where id = v_m.org_id;
  v_apres := alerterobot._apres_silence(v_m.org_id, v_m.critique or p_type = 'retabli');
  if p_type <> 'retabli' then
    select min(mc.ordre) into v_premier
    from alerterobot.moniteur_contacts mc join alerterobot.contacts c on c.id = mc.contact_id
    where mc.moniteur_id = p_moniteur and c.actif and mc.ordre >= p_ordre_min
      and alerterobot._de_garde(c.astreinte_jours, v_fuseau);
    if v_premier is not null and v_premier > p_ordre_max then
      v_min := v_premier;
      v_max := v_premier;
    end if;
  end if;
  for v_c in
    select c.* from alerterobot.moniteur_contacts mc
    join alerterobot.contacts c on c.id = mc.contact_id
    where mc.moniteur_id = p_moniteur and c.actif and mc.ordre between v_min and v_max
      and (p_type = 'retabli' or alerterobot._de_garde(c.astreinte_jours, v_fuseau))
  loop
    if v_c.email is not null then
      insert into alerterobot.notifications (org_id, incident_id, moniteur_id, contact_id, canal, type, envoyer_apres)
      values (v_m.org_id, p_incident, p_moniteur, v_c.id, 'email', p_type, v_apres);
      v_nb := v_nb + 1;
    end if;
    if v_c.user_id is not null and exists (select 1 from alerterobot.abonnements_push a where a.user_id = v_c.user_id) then
      insert into alerterobot.notifications (org_id, incident_id, moniteur_id, contact_id, canal, type, envoyer_apres)
      values (v_m.org_id, p_incident, p_moniteur, v_c.id, 'push', p_type, v_apres);
      v_nb := v_nb + 1;
    end if;
  end loop;
  return v_nb;
end;
$$;

-- Escalade vers le premier niveau suivant où quelqu'un est de garde.
create or replace function alerterobot.planifier_relances() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v record;
  v_m alerterobot.moniteurs;
  v_inc uuid;
  v_suivant int;
  v_nb int := 0;
begin
  for v in
    select i.id, i.moniteur_id, i.confirme_le, i.escalade_niveau, i.derniere_relance, o.rappel_min, o.escalade_min, o.fuseau
    from alerterobot.incidents i join alerterobot.organisations o on o.id = i.org_id
    where i.fin is null and i.vu_le is null and not i.en_maintenance
    for update of i skip locked
  loop
    v_suivant := null;
    if now() >= v.confirme_le + make_interval(mins => v.escalade_min * v.escalade_niveau) then
      select min(mc.ordre) into v_suivant
      from alerterobot.moniteur_contacts mc join alerterobot.contacts c on c.id = mc.contact_id
      where mc.moniteur_id = v.moniteur_id and c.actif and mc.ordre > v.escalade_niveau
        and alerterobot._de_garde(c.astreinte_jours, v.fuseau);
    end if;
    if v_suivant is not null then
      update alerterobot.incidents set escalade_niveau = v_suivant, derniere_relance = now() where id = v.id;
      v_nb := v_nb + alerterobot._planifier_notifications(v.id, v.moniteur_id, 'escalade', v_suivant, v_suivant);
      v_nb := v_nb + alerterobot._planifier_notifications(v.id, v.moniteur_id, 'rappel', 1, v.escalade_niveau);
    elsif now() >= v.derniere_relance + make_interval(mins => v.rappel_min) then
      update alerterobot.incidents set derniere_relance = now() where id = v.id;
      v_nb := v_nb + alerterobot._planifier_notifications(v.id, v.moniteur_id, 'rappel', 1, v.escalade_niveau);
    end if;
  end loop;

  for v_m in
    select * from alerterobot.moniteurs
    where type = 'heartbeat' and actif and etat <> 'panne'
      and coalesce(dernier_signal, cree_le) + make_interval(secs => heartbeat_periode_s + heartbeat_grace_s) < now()
    for update skip locked
  loop
    insert into alerterobot.incidents (org_id, moniteur_id, debut, cause, lieux, en_maintenance, derniere_relance)
    values (v_m.org_id, v_m.id, coalesce(v_m.dernier_signal, v_m.cree_le) + make_interval(secs => v_m.heartbeat_periode_s),
            'Aucun signal reçu dans le délai prévu', 'heartbeat', alerterobot._en_maintenance(v_m.id), now())
    returning id into v_inc;
    update alerterobot.moniteurs set etat = 'panne', etat_depuis = now() where id = v_m.id;
    if not alerterobot._en_maintenance(v_m.id) then
      v_nb := v_nb + alerterobot._planifier_notifications(v_inc, v_m.id, 'panne', 1, 1);
    end if;
  end loop;
  return v_nb;
end;
$$;

-- ---------------------------------------------------------------- Abonnés : fonctions serveur

-- Inscription (non confirmée) d'un visiteur à une page de statut.
create function alerterobot.abonner_statut(p_slug text, p_email text)
returns table (abonne_id uuid, client_nom text, deja_confirme boolean)
language plpgsql security definer set search_path = '' as $$
declare v_client alerterobot.clients;
begin
  select * into v_client from alerterobot.clients where slug_statut = p_slug;
  if not found or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(p_email) > 254 then
    return;
  end if;
  return query
    insert into alerterobot.abonnes_statut as a (client_id, email) values (v_client.id, lower(trim(p_email)))
    on conflict (client_id, lower(email)) do update set email = a.email
    returning a.id, v_client.nom, a.confirme_le is not null;
end;
$$;

create function alerterobot.confirmer_abonnement(p_id uuid) returns text
language sql security definer set search_path = '' as $$
  update alerterobot.abonnes_statut set confirme_le = coalesce(confirme_le, now()) where id = p_id
  returning (select nom from alerterobot.clients where id = client_id);
$$;

create function alerterobot.desabonner(p_id uuid) returns text
language sql security definer set search_path = '' as $$
  delete from alerterobot.abonnes_statut where id = p_id
  returning (select nom from alerterobot.clients where id = client_id);
$$;

create function alerterobot.reserver_envois_abonnes(p_limite int default 50)
returns table (id uuid, abonne_id uuid, email text, client_nom text, slug text, sujet text, corps text)
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  update alerterobot.envois_abonnes e set
    statut = case when e.tentatives >= 5 then 'echec'::alerterobot.statut_notification else 'a_envoyer'::alerterobot.statut_notification end
  where e.statut = 'envoi' and e.verrou_jusqu < now();
  for r in
    select e.* from alerterobot.envois_abonnes e where e.statut = 'a_envoyer'
    order by e.cree_le limit least(greatest(p_limite, 1), 200) for update skip locked
  loop
    update alerterobot.envois_abonnes e2 set statut = 'envoi', tentatives = e2.tentatives + 1, verrou_jusqu = now() + interval '5 minutes'
    where e2.id = r.id;
    return query
      select r.id, a.id, a.email, cl.nom, cl.slug_statut, r.sujet, r.corps
      from alerterobot.abonnes_statut a join alerterobot.clients cl on cl.id = a.client_id
      where a.id = r.abonne_id;
  end loop;
end;
$$;

create function alerterobot.marquer_envoi_abonne(p_id uuid, p_ok boolean, p_erreur text default null)
returns void language sql security definer set search_path = '' as $$
  update alerterobot.envois_abonnes set
    statut = case when p_ok then 'envoyee'::alerterobot.statut_notification
                  when tentatives >= 5 then 'echec'::alerterobot.statut_notification
                  else 'a_envoyer'::alerterobot.statut_notification end,
    envoye_le = case when p_ok then now() end, erreur = left(p_erreur, 300), verrou_jusqu = null
  where id = p_id and statut = 'envoi';
$$;

-- Pages de statut d'une organisation, avec le nombre d'abonnés confirmés (pour les membres).
create function alerterobot.pages_statut(p_org uuid)
returns table (client_id uuid, nom text, slug text, abonnes bigint, services bigint)
language sql stable security definer set search_path = '' as $$
  select cl.id, cl.nom, cl.slug_statut,
    (select count(*) from alerterobot.abonnes_statut a where a.client_id = cl.id and a.confirme_le is not null),
    (select count(*) from alerterobot.moniteurs m where m.client_id = cl.id and m.public)
  from alerterobot.clients cl
  where cl.org_id = p_org and alerterobot.est_membre(p_org)
  order by cl.nom;
$$;

-- ---------------------------------------------------------------- Page de statut enrichie

create or replace function alerterobot.statut_public(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_client alerterobot.clients;
  v_debut timestamptz := date_trunc('day', now()) - interval '89 days';
  v_services jsonb;
  v_incidents jsonb;
  v_maintenances jsonb;
begin
  select * into v_client from alerterobot.clients where slug_statut = p_slug;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(s order by s->>'nom'), '[]') into v_services from (
    select jsonb_build_object(
      'nom', m.nom,
      'etat', case when m.etat = 'suspect' then 'ok' else m.etat::text end,
      'disponibilite', round(100 - 100 * coalesce((
          select sum(extract(epoch from least(coalesce(i.fin, now()), now()) - greatest(i.debut, v_debut)))
          from alerterobot.incidents i where i.moniteur_id = m.id and coalesce(i.fin, now()) > v_debut and not i.en_maintenance
        ), 0) / extract(epoch from now() - v_debut), 2),
      'jours', (
        select jsonb_agg(jsonb_build_object('jour', j::date, 'pannes', (
            select coalesce(sum(extract(epoch from least(coalesce(i.fin, now()), j + interval '1 day') - greatest(i.debut, j)) / 60), 0)::int
            from alerterobot.incidents i
            where i.moniteur_id = m.id and i.debut < j + interval '1 day' and coalesce(i.fin, now()) > j and not i.en_maintenance),
          'maintenance', exists (select 1 from alerterobot.maintenances mt
            where mt.org_id = m.org_id and (mt.moniteur_id is null or mt.moniteur_id = m.id)
              and mt.debut < j + interval '1 day' and mt.fin > j)) order by j)
        from generate_series(v_debut, date_trunc('day', now()), interval '1 day') j)
    ) s
    from alerterobot.moniteurs m
    where m.client_id = v_client.id and m.public and m.actif
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
      'service', m.nom, 'debut', i.debut, 'fin', i.fin,
      'maj', (select coalesce(jsonb_agg(jsonb_build_object('etape', u.etape, 'message', u.message, 'le', u.cree_le) order by u.cree_le desc), '[]')
              from alerterobot.incident_maj u where u.incident_id = i.id and u.publique)
    ) order by i.debut desc), '[]')
  into v_incidents
  from alerterobot.incidents i join alerterobot.moniteurs m on m.id = i.moniteur_id
  where m.client_id = v_client.id and m.public and i.debut > v_debut and not i.en_maintenance;

  select coalesce(jsonb_agg(jsonb_build_object(
      'debut', mt.debut, 'fin', mt.fin, 'motif', mt.motif, 'service', m.nom) order by mt.debut), '[]')
  into v_maintenances
  from alerterobot.maintenances mt left join alerterobot.moniteurs m on m.id = mt.moniteur_id
  where mt.org_id = v_client.org_id and mt.publique and mt.fin > now() and mt.debut < now() + interval '14 days'
    and (mt.moniteur_id is null or (m.client_id = v_client.id and m.public));

  return jsonb_build_object('nom', v_client.nom, 'services', v_services, 'incidents', v_incidents, 'maintenances', v_maintenances);
end;
$$;

-- ---------------------------------------------------------------- Droits d'exécution

do $$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text from pg_proc p
    where p.pronamespace = 'alerterobot'::regnamespace and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

grant execute on function alerterobot.est_membre(uuid, alerterobot.role_membre[]) to authenticated;
grant execute on function alerterobot.peut_ecrire(uuid) to authenticated;
grant execute on function alerterobot.peut_gerer(uuid) to authenticated;
grant execute on function alerterobot.creer_organisation(text) to authenticated;
grant execute on function alerterobot.regenerer_heartbeat(uuid) to authenticated;
grant execute on function alerterobot.accuser_reception(uuid) to authenticated;
grant execute on function alerterobot.enregistrer_push(text, text, text) to authenticated;
grant execute on function alerterobot.temps_reponse_24h(uuid) to authenticated;
grant execute on function alerterobot.publier_maj(uuid, alerterobot.etape_incident, text, boolean) to authenticated;
grant execute on function alerterobot.pages_statut(uuid) to authenticated;
