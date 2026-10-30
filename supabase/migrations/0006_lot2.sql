-- AlerteRobot — lot 2 :
--   5. heartbeat avancé (Healthchecks.io, Cronitor) : signaux début et échec, durée, tâche bloquée ;
--   6. rapport mensuel de disponibilité par client, envoyé le 1er du mois ;
--   7. intégrations : webhook signé et Telegram.

-- ---------------------------------------------------------------- 7. Intégrations (types d'abord)

alter type alerterobot.canal add value if not exists 'webhook';
alter type alerterobot.canal add value if not exists 'telegram';
create type alerterobot.type_integration as enum ('webhook', 'telegram');

create table alerterobot.integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references alerterobot.organisations on delete cascade,
  type alerterobot.type_integration not null,
  nom text not null check (char_length(nom) between 2 and 80),
  url text check (url is null or (char_length(url) <= 2048 and url ~ '^https://')),
  -- Secret de signature du webhook : jamais lisible par les membres (droits par colonne).
  secret text,
  telegram_chat_id bigint,
  telegram_code text unique,
  telegram_code_expire timestamptz,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  check (type <> 'webhook' or (url is not null and secret is not null))
);
create index integrations_org on alerterobot.integrations (org_id);
alter table alerterobot.integrations enable row level security;
create policy lire on alerterobot.integrations for select to authenticated using (alerterobot.est_membre(org_id));
create policy modifier on alerterobot.integrations for update to authenticated using (alerterobot.peut_gerer(org_id)) with check (alerterobot.peut_gerer(org_id));
create policy supprimer on alerterobot.integrations for delete to authenticated using (alerterobot.peut_gerer(org_id));
grant select (id, org_id, type, nom, url, telegram_chat_id, actif, cree_le) on alerterobot.integrations to authenticated;
grant update (nom, actif) , delete on alerterobot.integrations to authenticated;
grant all on alerterobot.integrations to service_role;

alter table alerterobot.notifications alter column contact_id drop not null;
alter table alerterobot.notifications add column integration_id uuid references alerterobot.integrations on delete cascade;
alter table alerterobot.notifications add constraint notifications_destinataire check (contact_id is not null or integration_id is not null);

-- Webhook : le secret n'est rendu qu'une fois, à la création.
create function alerterobot.creer_webhook(p_org uuid, p_nom text, p_url text)
returns table (id uuid, secret text)
language plpgsql security definer set search_path = '' as $$
declare v_secret text := 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not alerterobot.peut_gerer(p_org) then
    raise exception 'Action réservée aux administrateurs.' using errcode = '42501';
  end if;
  if (select count(*) from alerterobot.integrations where org_id = p_org) >= 10 then
    raise exception 'Limite de 10 intégrations atteinte.' using errcode = 'P0001';
  end if;
  return query
    insert into alerterobot.integrations as i (org_id, type, nom, url, secret)
    values (p_org, 'webhook', trim(p_nom), p_url, v_secret)
    returning i.id, v_secret;
  perform alerterobot._journal(p_org, 'integration_creee', 'webhook');
end;
$$;

-- Telegram : un code à usage unique, valable 15 min, à envoyer au robot avec /start.
create function alerterobot.creer_lien_telegram(p_org uuid, p_nom text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_code text := encode(extensions.gen_random_bytes(12), 'hex');
begin
  if not alerterobot.peut_gerer(p_org) then
    raise exception 'Action réservée aux administrateurs.' using errcode = '42501';
  end if;
  if (select count(*) from alerterobot.integrations where org_id = p_org) >= 10 then
    raise exception 'Limite de 10 intégrations atteinte.' using errcode = 'P0001';
  end if;
  insert into alerterobot.integrations (org_id, type, nom, telegram_code, telegram_code_expire, actif)
  values (p_org, 'telegram', trim(p_nom), v_code, now() + interval '15 minutes', false);
  return v_code;
end;
$$;

-- Appelée par le notifieur quand le robot reçoit « /start <code> ».
create function alerterobot.lier_telegram(p_code text, p_chat_id bigint)
returns text language sql security definer set search_path = '' as $$
  update alerterobot.integrations
  set telegram_chat_id = p_chat_id, telegram_code = null, telegram_code_expire = null, actif = true
  where telegram_code = p_code and telegram_code_expire > now() and type = 'telegram'
  returning (select nom from alerterobot.organisations o where o.id = org_id);
$$;

-- ---------------------------------------------------------------- 5. Heartbeat avancé

alter table alerterobot.moniteurs
  add column heartbeat_debut timestamptz,
  add column heartbeat_duree_ms int,
  add column heartbeat_duree_max_s int check (heartbeat_duree_max_s is null or heartbeat_duree_max_s between 60 and 86400);
grant insert (heartbeat_duree_max_s), update (heartbeat_duree_max_s) on alerterobot.moniteurs to authenticated;

-- Ouvre un incident de heartbeat (échec signalé ou tâche bloquée) et prévient le niveau 1.
create function alerterobot._incident_heartbeat(p_moniteur uuid, p_debut timestamptz, p_cause text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_m alerterobot.moniteurs;
  v_inc uuid;
  v_maint boolean := alerterobot._en_maintenance(p_moniteur);
begin
  select * into v_m from alerterobot.moniteurs where id = p_moniteur for update;
  if v_m.etat = 'panne' or exists (select 1 from alerterobot.incidents where moniteur_id = p_moniteur and fin is null) then
    return;
  end if;
  insert into alerterobot.incidents (org_id, moniteur_id, debut, cause, lieux, en_maintenance, derniere_relance)
  values (v_m.org_id, p_moniteur, p_debut, left(p_cause, 300), 'heartbeat', v_maint, now())
  returning id into v_inc;
  update alerterobot.moniteurs set etat = 'panne', etat_depuis = now() where id = p_moniteur;
  if not v_maint then
    perform alerterobot._planifier_notifications(v_inc, p_moniteur, 'panne', 1, 1);
  end if;
end;
$$;

drop function alerterobot.ping_heartbeat(text);

-- Signaux : « start » (la tâche commence), « ok » (terminée), « fail » (elle a échoué).
create function alerterobot.ping_heartbeat(p_jeton text, p_signal text default 'ok', p_message text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_m alerterobot.moniteurs;
begin
  if p_jeton is null or p_jeton !~ '^[0-9a-f]{48}$' or p_signal not in ('start', 'ok', 'fail') then
    return false;
  end if;
  select * into v_m from alerterobot.moniteurs
  where heartbeat_jeton_hash = extensions.digest(p_jeton, 'sha256') and type = 'heartbeat' and actif
  for update;
  if not found then
    return false;
  end if;

  if p_signal = 'start' then
    update alerterobot.moniteurs set heartbeat_debut = now() where id = v_m.id;
  elsif p_signal = 'fail' then
    update alerterobot.moniteurs set dernier_signal = now(), derniere_verif = now(), heartbeat_debut = null,
      heartbeat_duree_ms = case when v_m.heartbeat_debut is not null then (extract(epoch from now() - v_m.heartbeat_debut) * 1000)::int end
    where id = v_m.id;
    perform alerterobot._incident_heartbeat(v_m.id, now(),
      'La tâche a signalé un échec' || coalesce(' : ' || nullif(trim(regexp_replace(left(p_message, 200), '[[:cntrl:]]', ' ', 'g')), ''), ''));
  else
    if v_m.etat = 'panne' then
      perform alerterobot._clore_incident(v_m.id);
    end if;
    update alerterobot.moniteurs set dernier_signal = now(), derniere_verif = now(), heartbeat_debut = null,
      heartbeat_duree_ms = case when v_m.heartbeat_debut is not null then (extract(epoch from now() - v_m.heartbeat_debut) * 1000)::int else heartbeat_duree_ms end,
      etat = 'ok', etat_depuis = case when etat <> 'ok' then now() else etat_depuis end
    where id = v_m.id;
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------- Envois (contacts et intégrations)

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
  -- Les intégrations reçoivent les débuts et fins d'incident et les avertissements, pas les rappels.
  if p_type in ('panne', 'retabli', 'lenteur', 'ssl') and p_ordre_min = 1 then
    insert into alerterobot.notifications (org_id, incident_id, moniteur_id, integration_id, canal, type, envoyer_apres)
    select v_m.org_id, p_incident, p_moniteur, i.id, i.type::text::alerterobot.canal, p_type, now()
    from alerterobot.integrations i where i.org_id = v_m.org_id and i.actif;
    get diagnostics v_premier = row_count;
    v_nb := v_nb + v_premier;
  end if;
  return v_nb;
end;
$$;

drop function alerterobot.reserver_notifications(int);

create function alerterobot.reserver_notifications(p_limite int default 50)
returns table (id uuid, canal alerterobot.canal, type alerterobot.type_notification, contact_id uuid,
               contact_nom text, email text, user_id uuid, moniteur_id uuid, moniteur_nom text,
               moniteur_url text, client_nom text, incident_id uuid, debut timestamptz, fin timestamptz,
               cause text, lieux text, escalade_niveau int, ssl_expire_le timestamptz, dernier_ms int,
               seuil_lent_ms int, jeton text, integration_id uuid, integration_url text,
               integration_secret text, telegram_chat_id bigint)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_jeton text;
begin
  update alerterobot.notifications n set
    statut = case when n.tentatives >= 5 then 'echec'::alerterobot.statut_notification else 'a_envoyer'::alerterobot.statut_notification end,
    erreur = coalesce(n.erreur, 'verrou expiré')
  where n.statut = 'envoi' and n.verrou_jusqu < now();

  for r in
    select n.* from alerterobot.notifications n
    where n.statut = 'a_envoyer' and n.envoyer_apres <= now() and n.cree_le <= now() - interval '20 seconds'
    order by n.cree_le
    limit least(greatest(p_limite, 1), 200)
    for update skip locked
  loop
    update alerterobot.notifications n2 set statut = 'envoi', tentatives = n2.tentatives + 1,
      verrou_jusqu = now() + interval '5 minutes'
    where n2.id = r.id;
    v_jeton := null;
    if r.type in ('panne', 'rappel', 'escalade') and r.incident_id is not null and r.contact_id is not null then
      v_jeton := encode(extensions.gen_random_bytes(24), 'hex');
      insert into alerterobot.jetons_vu (jeton_hash, incident_id, contact_id, expire_le)
      values (extensions.digest(v_jeton, 'sha256'), r.incident_id, r.contact_id, now() + interval '24 hours');
    end if;
    return query
      select r.id, r.canal, r.type, c.id, c.nom, c.email, c.user_id, m.id, m.nom, m.url, cl.nom,
             i.id, i.debut, i.fin, i.cause, i.lieux, i.escalade_niveau, m.ssl_expire_le, m.dernier_ms,
             m.seuil_lent_ms, v_jeton, ig.id, ig.url, ig.secret, ig.telegram_chat_id
      from alerterobot.moniteurs m
      left join alerterobot.contacts c on c.id = r.contact_id
      left join alerterobot.integrations ig on ig.id = r.integration_id
      left join alerterobot.clients cl on cl.id = m.client_id
      left join alerterobot.incidents i on i.id = r.incident_id
      where m.id = r.moniteur_id;
  end loop;
end;
$$;

-- Rappels, escalade, heartbeats en retard ou bloqués.
create or replace function alerterobot.planifier_relances() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v record;
  v_m alerterobot.moniteurs;
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

  -- Aucun signal dans le délai prévu.
  for v_m in
    select * from alerterobot.moniteurs
    where type = 'heartbeat' and actif and etat <> 'panne'
      and coalesce(dernier_signal, cree_le) + make_interval(secs => heartbeat_periode_s + heartbeat_grace_s) < now()
    for update skip locked
  loop
    perform alerterobot._incident_heartbeat(v_m.id, coalesce(v_m.dernier_signal, v_m.cree_le) + make_interval(secs => v_m.heartbeat_periode_s),
      'Aucun signal reçu dans le délai prévu');
    v_nb := v_nb + 1;
  end loop;

  -- La tâche a commencé mais ne se termine pas.
  for v_m in
    select * from alerterobot.moniteurs
    where type = 'heartbeat' and actif and etat <> 'panne' and heartbeat_debut is not null and heartbeat_duree_max_s is not null
      and heartbeat_debut + make_interval(secs => heartbeat_duree_max_s) < now()
    for update skip locked
  loop
    perform alerterobot._incident_heartbeat(v_m.id, v_m.heartbeat_debut,
      format('La tâche tourne depuis plus de %s min sans se terminer', v_m.heartbeat_duree_max_s / 60));
    v_nb := v_nb + 1;
  end loop;
  return v_nb;
end;
$$;

-- ---------------------------------------------------------------- 6. Rapport mensuel

create table alerterobot.rapports_envoyes (
  org_id uuid not null references alerterobot.organisations on delete cascade,
  mois date not null,
  envoye_le timestamptz not null default now(),
  primary key (org_id, mois)
);
alter table alerterobot.rapports_envoyes enable row level security;
grant all on alerterobot.rapports_envoyes to service_role;

-- Disponibilité, incidents et temps de réponse d'un mois, par client et par service.
create function alerterobot.rapport_mensuel(p_org uuid, p_mois date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_debut timestamptz;
  v_fin timestamptz;
  v_duree numeric;
  v_services jsonb;
begin
  if not (alerterobot.est_membre(p_org) or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Rapport introuvable.' using errcode = '42501';
  end if;
  v_debut := date_trunc('month', p_mois::timestamp) at time zone 'Africa/Abidjan';
  v_fin := least((date_trunc('month', p_mois::timestamp) + interval '1 month') at time zone 'Africa/Abidjan', now());
  if v_fin <= v_debut then
    return jsonb_build_object('mois', to_char(p_mois, 'YYYY-MM'), 'services', '[]'::jsonb);
  end if;
  v_duree := extract(epoch from v_fin - v_debut);

  select coalesce(jsonb_agg(s order by s->>'client', s->>'nom'), '[]') into v_services from (
    select jsonb_build_object(
      'nom', m.nom,
      'client', coalesce(cl.nom, ''),
      'type', m.type,
      'disponibilite', round(100 - 100 * coalesce(p.secondes, 0) / greatest(extract(epoch from v_fin - greatest(v_debut, m.cree_le)), 1), 3),
      'incidents', coalesce(p.nombre, 0),
      'minutes_panne', round(coalesce(p.secondes, 0) / 60),
      'plus_long_min', round(coalesce(p.plus_long, 0) / 60),
      'ms_moyen', (select round(avg(v.ms)) from alerterobot.verifications v
                   where v.moniteur_id = m.id and v.ok and v.lieu = 'abidjan' and v.le >= v_debut and v.le < v_fin)
    ) s
    from alerterobot.moniteurs m
    left join alerterobot.clients cl on cl.id = m.client_id
    left join lateral (
      select count(*) nombre,
        sum(extract(epoch from least(coalesce(i.fin, now()), v_fin) - greatest(i.debut, v_debut))) secondes,
        max(extract(epoch from least(coalesce(i.fin, now()), v_fin) - greatest(i.debut, v_debut))) plus_long
      from alerterobot.incidents i
      where i.moniteur_id = m.id and not i.en_maintenance and i.debut < v_fin and coalesce(i.fin, now()) > v_debut
    ) p on true
    where m.org_id = p_org and m.cree_le < v_fin
  ) x;

  return jsonb_build_object(
    'mois', to_char(p_mois, 'YYYY-MM'),
    'organisation', (select nom from alerterobot.organisations where id = p_org),
    'debut', v_debut, 'fin', v_fin,
    'services', v_services,
    'faux_positifs', (select count(*) from alerterobot.journal_audit j where j.org_id = p_org and j.action = 'faux_positif_evite' and j.le >= v_debut and j.le < v_fin),
    'alertes', (select count(*) from alerterobot.notifications n where n.org_id = p_org and n.statut = 'envoyee' and n.cree_le >= v_debut and n.cree_le < v_fin)
  );
end;
$$;

-- Le 1er du mois à partir de 8 h (Abidjan) : organisations dont le rapport du mois précédent n'est pas parti.
create function alerterobot.rapports_a_envoyer()
returns table (org_id uuid, org_nom text, mois date, emails text[])
language sql stable security definer set search_path = '' as $$
  select o.id, o.nom, (date_trunc('month', now() at time zone 'Africa/Abidjan') - interval '1 month')::date,
    array(select c.email from alerterobot.contacts c where c.org_id = o.id and c.actif and c.niveau = 1 and c.email is not null)
  from alerterobot.organisations o
  where extract(hour from now() at time zone 'Africa/Abidjan') >= 8
    and exists (select 1 from alerterobot.moniteurs m where m.org_id = o.id
                and m.cree_le < date_trunc('month', now() at time zone 'Africa/Abidjan') at time zone 'Africa/Abidjan')
    and not exists (select 1 from alerterobot.rapports_envoyes r where r.org_id = o.id
                    and r.mois = (date_trunc('month', now() at time zone 'Africa/Abidjan') - interval '1 month')::date)
  limit 100;
$$;

create function alerterobot.marquer_rapport_envoye(p_org uuid, p_mois date) returns void
language sql security definer set search_path = '' as $$
  insert into alerterobot.rapports_envoyes (org_id, mois) values (p_org, p_mois) on conflict do nothing;
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
grant execute on function alerterobot.creer_webhook(uuid, text, text) to authenticated;
grant execute on function alerterobot.creer_lien_telegram(uuid, text) to authenticated;
grant execute on function alerterobot.rapport_mensuel(uuid, date) to authenticated;
