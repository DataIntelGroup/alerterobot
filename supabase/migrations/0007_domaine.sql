-- AlerteRobot — expiration du nom de domaine (RDAP), comme pour le certificat :
-- alerte aux paliers de 30, 7 et 1 jour, une fois par palier.

alter type alerterobot.type_notification add value if not exists 'domaine';

alter table alerterobot.moniteurs
  add column domaine text check (domaine is null or char_length(domaine) <= 253),
  add column domaine_expire_le timestamptz,
  add column domaine_palier_notifie int,
  add column domaine_verifie_le timestamptz;

-- Appelée par le worker (une fois par jour et par moniteur) avec la date lue dans le registre.
create function alerterobot.enregistrer_domaine(p_moniteur uuid, p_domaine text, p_expire timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_m alerterobot.moniteurs;
  v_jours numeric;
  v_palier int;
begin
  select * into v_m from alerterobot.moniteurs where id = p_moniteur for update;
  if not found then
    return;
  end if;
  if p_expire is not null then
    v_jours := extract(epoch from p_expire - now()) / 86400;
    v_palier := case when v_jours <= 1 then 1 when v_jours <= 7 then 7 when v_jours <= 30 then 30 end;
    if v_palier is null then
      v_m.domaine_palier_notifie := null;
    elsif (v_m.domaine_palier_notifie is null or v_palier < v_m.domaine_palier_notifie) and not alerterobot._en_maintenance(p_moniteur) then
      update alerterobot.moniteurs set domaine_expire_le = p_expire where id = p_moniteur;
      perform alerterobot._planifier_notifications(null, p_moniteur, 'domaine', 1, 1);
      v_m.domaine_palier_notifie := v_palier;
    end if;
  end if;
  update alerterobot.moniteurs set
    domaine = left(p_domaine, 253),
    domaine_expire_le = coalesce(p_expire, domaine_expire_le),
    domaine_palier_notifie = v_m.domaine_palier_notifie,
    domaine_verifie_le = now()
  where id = p_moniteur;
end;
$$;

-- Le notifieur reçoit aussi la date d'expiration du domaine.
drop function alerterobot.reserver_notifications(int);

create function alerterobot.reserver_notifications(p_limite int default 50)
returns table (id uuid, canal alerterobot.canal, type alerterobot.type_notification, contact_id uuid,
               contact_nom text, email text, user_id uuid, moniteur_id uuid, moniteur_nom text,
               moniteur_url text, client_nom text, incident_id uuid, debut timestamptz, fin timestamptz,
               cause text, lieux text, escalade_niveau int, ssl_expire_le timestamptz, dernier_ms int,
               seuil_lent_ms int, jeton text, integration_id uuid, integration_url text,
               integration_secret text, telegram_chat_id bigint, domaine text, domaine_expire_le timestamptz)
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
             m.seuil_lent_ms, v_jeton, ig.id, ig.url, ig.secret, ig.telegram_chat_id, m.domaine, m.domaine_expire_le
      from alerterobot.moniteurs m
      left join alerterobot.contacts c on c.id = r.contact_id
      left join alerterobot.integrations ig on ig.id = r.integration_id
      left join alerterobot.clients cl on cl.id = m.client_id
      left join alerterobot.incidents i on i.id = r.incident_id
      where m.id = r.moniteur_id;
  end loop;
end;
$$;

-- Les intégrations reçoivent aussi l'alerte de domaine (même règle que le certificat).
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
  if p_type::text in ('panne', 'retabli', 'lenteur', 'ssl', 'domaine') and p_ordre_min = 1 then
    insert into alerterobot.notifications (org_id, incident_id, moniteur_id, integration_id, canal, type, envoyer_apres)
    select v_m.org_id, p_incident, p_moniteur, i.id, i.type::text::alerterobot.canal, p_type, now()
    from alerterobot.integrations i where i.org_id = v_m.org_id and i.actif;
    get diagnostics v_premier = row_count;
    v_nb := v_nb + v_premier;
  end if;
  return v_nb;
end;
$$;

revoke execute on function alerterobot.enregistrer_domaine(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function alerterobot.reserver_notifications(int) from public, anon, authenticated;
grant execute on function alerterobot.enregistrer_domaine(uuid, text, timestamptz) to service_role;
grant execute on function alerterobot.reserver_notifications(int) to service_role;
