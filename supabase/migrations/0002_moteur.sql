-- AlerteRobot — moteur d'incidents et fonctions appelées par l'application.
-- Les fonctions « worker » ne sont exécutables que par service_role : les
-- workers et le serveur Next les appellent avec la clé secrète, jamais le navigateur.

alter table alerterobot.moniteurs add column ssl_palier_notifie int;

-- ---------------------------------------------------------------- Aides internes

create function alerterobot._journal(p_org uuid, p_action text, p_cible text, p_details jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into alerterobot.journal_audit (org_id, user_id, action, cible, details)
  values (p_org, auth.uid(), p_action, p_cible, coalesce(p_details, '{}'));
$$;

create function alerterobot._en_maintenance(p_moniteur uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select true from alerterobot.maintenances mt
    join alerterobot.moniteurs m on m.org_id = mt.org_id
    where m.id = p_moniteur and (mt.moniteur_id is null or mt.moniteur_id = p_moniteur)
      and now() >= mt.debut and now() < mt.fin
    limit 1), false);
$$;

-- Heure d'envoi : tout de suite, ou à la fin des heures silencieuses pour un moniteur non critique.
create function alerterobot._apres_silence(p_org uuid, p_critique boolean) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org alerterobot.organisations;
  v_local timestamp;
  v_t time;
  v_dans boolean;
  v_fin timestamp;
begin
  select * into v_org from alerterobot.organisations where id = p_org;
  if p_critique or v_org.silence_debut is null or v_org.silence_fin is null then
    return now();
  end if;
  v_local := now() at time zone v_org.fuseau;
  v_t := v_local::time;
  if v_org.silence_debut < v_org.silence_fin then
    v_dans := v_t >= v_org.silence_debut and v_t < v_org.silence_fin;
  else
    v_dans := v_t >= v_org.silence_debut or v_t < v_org.silence_fin;
  end if;
  if not v_dans then
    return now();
  end if;
  v_fin := date_trunc('day', v_local) + v_org.silence_fin;
  if v_fin <= v_local then
    v_fin := v_fin + interval '1 day';
  end if;
  return v_fin at time zone v_org.fuseau;
end;
$$;

-- Met en file une notification par contact actif (ordre entre min et max) et par canal disponible.
create function alerterobot._planifier_notifications(
  p_incident uuid, p_moniteur uuid, p_type alerterobot.type_notification, p_ordre_min int, p_ordre_max int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_m alerterobot.moniteurs;
  v_apres timestamptz;
  v_nb int := 0;
  v_c record;
begin
  select * into v_m from alerterobot.moniteurs where id = p_moniteur;
  -- Le rétablissement et la panne critique partent toujours ; le reste respecte les heures silencieuses.
  v_apres := alerterobot._apres_silence(v_m.org_id, v_m.critique or p_type = 'retabli');
  for v_c in
    select c.* from alerterobot.moniteur_contacts mc
    join alerterobot.contacts c on c.id = mc.contact_id
    where mc.moniteur_id = p_moniteur and c.actif and mc.ordre between p_ordre_min and p_ordre_max
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

-- Clôt l'incident ouvert d'un moniteur et prévient ceux qui avaient été alertés.
create function alerterobot._clore_incident(p_moniteur uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_inc alerterobot.incidents;
begin
  update alerterobot.incidents set fin = now()
  where moniteur_id = p_moniteur and fin is null
  returning * into v_inc;
  if v_inc.id is null then
    return;
  end if;
  update alerterobot.notifications set statut = 'ignoree'
  where incident_id = v_inc.id and statut = 'a_envoyer' and type in ('rappel', 'escalade');
  if not v_inc.en_maintenance then
    perform alerterobot._planifier_notifications(v_inc.id, p_moniteur, 'retabli', 1, v_inc.escalade_niveau);
  end if;
end;
$$;

-- ---------------------------------------------------------------- Moteur (service_role)

-- Le worker d'un lieu réserve les vérifications dues. Le verrou de 2 min évite
-- qu'un autre processus du même lieu les prenne ; il expire si le worker meurt.
create function alerterobot.reserver_verifications(p_lieu alerterobot.lieu, p_limite int default 50)
returns table (moniteur_id uuid, type alerterobot.type_moniteur, url text, mot_cle text, champ_json text,
               seuil_lent_ms int, delai_ms int)
language sql security definer set search_path = '' as $$
  with dus as (
    select p.moniteur_id from alerterobot.planning p
    join alerterobot.moniteurs m on m.id = p.moniteur_id
    where p.lieu = p_lieu and p.prochaine_le <= now()
      and (p.verrou_jusqu is null or p.verrou_jusqu < now()) and m.actif
    order by p.prochaine_le
    limit least(greatest(p_limite, 1), 200)
    for update of p skip locked
  ), pris as (
    update alerterobot.planning p set verrou_jusqu = now() + interval '2 minutes'
    from dus where p.moniteur_id = dus.moniteur_id and p.lieu = p_lieu
    returning p.moniteur_id
  )
  select m.id, m.type, m.url, m.mot_cle, m.champ_json, m.seuil_lent_ms, m.delai_ms
  from alerterobot.moniteurs m join pris on pris.moniteur_id = m.id;
$$;

-- Enregistre un résultat et fait avancer l'état du moniteur.
--   ok/lent → suspect : premier échec, l'autre lieu revérifie tout de suite ;
--   suspect → panne   : échec confirmé par l'autre lieu, ou par le même après 3 min
--                        (l'autre worker est muet) ; alerte au contact d'ordre 1 ;
--   suspect → ok      : faux positif évité, aucune alerte ;
--   panne → ok        : incident clos, message de rétablissement.
create function alerterobot.enregistrer_verification(
  p_moniteur uuid, p_lieu alerterobot.lieu, p_ok boolean, p_code int, p_ms int, p_erreur text,
  p_ssl_expire timestamptz default null)
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

  insert into alerterobot.verifications (moniteur_id, lieu, ok, lent, code, ms, erreur)
  values (p_moniteur, p_lieu, p_ok, v_lent, p_code, p_ms, left(p_erreur, 300));

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

-- Appelée chaque minute : rappels, escalade, heartbeats en retard.
create function alerterobot.planifier_relances() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v record;
  v_m alerterobot.moniteurs;
  v_inc uuid;
  v_nb int := 0;
begin
  for v in
    select i.id, i.moniteur_id, i.confirme_le, i.escalade_niveau, i.derniere_relance, o.rappel_min, o.escalade_min
    from alerterobot.incidents i join alerterobot.organisations o on o.id = i.org_id
    where i.fin is null and i.vu_le is null and not i.en_maintenance
    for update of i skip locked
  loop
    if now() >= v.confirme_le + make_interval(mins => v.escalade_min * v.escalade_niveau)
       and exists (select 1 from alerterobot.moniteur_contacts mc join alerterobot.contacts c on c.id = mc.contact_id
                   where mc.moniteur_id = v.moniteur_id and c.actif and mc.ordre = v.escalade_niveau + 1) then
      update alerterobot.incidents set escalade_niveau = escalade_niveau + 1, derniere_relance = now() where id = v.id;
      v_nb := v_nb + alerterobot._planifier_notifications(v.id, v.moniteur_id, 'escalade', v.escalade_niveau + 1, v.escalade_niveau + 1);
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

-- Le notifieur réserve les envois dus. Le délai de 20 s laisse arriver les
-- pannes simultanées d'un même client pour les regrouper en un seul message.
-- Pour panne, rappel et escalade, un jeton « J'ai vu » neuf est créé ; seul son hash est gardé.
create function alerterobot.reserver_notifications(p_limite int default 50)
returns table (id uuid, canal alerterobot.canal, type alerterobot.type_notification, contact_id uuid,
               contact_nom text, email text, user_id uuid, moniteur_id uuid, moniteur_nom text,
               moniteur_url text, client_nom text, incident_id uuid, debut timestamptz, fin timestamptz,
               cause text, lieux text, escalade_niveau int, ssl_expire_le timestamptz, dernier_ms int,
               seuil_lent_ms int, jeton text)
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
    if r.type in ('panne', 'rappel', 'escalade') and r.incident_id is not null then
      v_jeton := encode(extensions.gen_random_bytes(24), 'hex');
      insert into alerterobot.jetons_vu (jeton_hash, incident_id, contact_id, expire_le)
      values (extensions.digest(v_jeton, 'sha256'), r.incident_id, r.contact_id, now() + interval '24 hours');
    end if;
    return query
      select r.id, r.canal, r.type, c.id, c.nom, c.email, c.user_id, m.id, m.nom, m.url, cl.nom,
             i.id, i.debut, i.fin, i.cause, i.lieux, i.escalade_niveau, m.ssl_expire_le, m.dernier_ms,
             m.seuil_lent_ms, v_jeton
      from alerterobot.contacts c
      join alerterobot.moniteurs m on m.id = r.moniteur_id
      left join alerterobot.clients cl on cl.id = m.client_id
      left join alerterobot.incidents i on i.id = r.incident_id
      where c.id = r.contact_id;
  end loop;
end;
$$;

create function alerterobot.marquer_notification(p_id uuid, p_ok boolean, p_erreur text default null)
returns void language sql security definer set search_path = '' as $$
  update alerterobot.notifications set
    statut = case when p_ok then 'envoyee'::alerterobot.statut_notification
                  when tentatives >= 5 then 'echec'::alerterobot.statut_notification
                  else 'a_envoyer'::alerterobot.statut_notification end,
    envoyer_apres = case when p_ok then envoyer_apres else now() + make_interval(mins => tentatives * 2) end,
    envoye_le = case when p_ok then now() end,
    erreur = left(p_erreur, 300),
    verrou_jusqu = null
  where id = p_id and statut = 'envoi';
$$;

-- Signal d'une tâche de fond. Le jeton est comparé par son hash.
create function alerterobot.ping_heartbeat(p_jeton text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_m alerterobot.moniteurs;
begin
  if p_jeton is null or p_jeton !~ '^[0-9a-f]{48}$' then
    return false;
  end if;
  select * into v_m from alerterobot.moniteurs
  where heartbeat_jeton_hash = extensions.digest(p_jeton, 'sha256') and type = 'heartbeat' and actif
  for update;
  if not found then
    return false;
  end if;
  if v_m.etat = 'panne' then
    perform alerterobot._clore_incident(v_m.id);
  end if;
  update alerterobot.moniteurs set dernier_signal = now(), derniere_verif = now(),
    etat = 'ok', etat_depuis = case when etat <> 'ok' then now() else etat_depuis end
  where id = v_m.id;
  return true;
end;
$$;

-- « J'ai vu » depuis un email ou une notification. Jeton à usage unique, 24 h.
create function alerterobot.confirmer_vu(p_jeton text)
returns table (resultat text, moniteur_nom text)
language plpgsql security definer set search_path = '' as $$
declare
  v_j alerterobot.jetons_vu;
  v_nom text;
  v_contact text;
begin
  if p_jeton is null or p_jeton !~ '^[0-9a-f]{48}$' then
    return query select 'invalide'::text, null::text;
    return;
  end if;
  select * into v_j from alerterobot.jetons_vu where jeton_hash = extensions.digest(p_jeton, 'sha256') for update;
  if not found or v_j.expire_le < now() then
    return query select 'invalide'::text, null::text;
    return;
  end if;
  select m.nom into v_nom from alerterobot.incidents i join alerterobot.moniteurs m on m.id = i.moniteur_id where i.id = v_j.incident_id;
  if v_j.utilise_le is not null then
    return query select 'deja'::text, v_nom;
    return;
  end if;
  select nom into v_contact from alerterobot.contacts where id = v_j.contact_id;
  update alerterobot.jetons_vu set utilise_le = now() where jeton_hash = v_j.jeton_hash;
  update alerterobot.incidents set vu_le = coalesce(vu_le, now()), vu_par = coalesce(vu_par, v_contact) where id = v_j.incident_id;
  update alerterobot.notifications set statut = 'ignoree'
  where incident_id = v_j.incident_id and statut = 'a_envoyer' and type in ('rappel', 'escalade');
  return query select 'ok'::text, v_nom;
end;
$$;

-- Limiteur à fenêtre fixe : true tant que la clé reste sous p_max appels.
create function alerterobot.limiter(p_cle text, p_max int, p_fenetre_s int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_fenetre timestamptz := to_timestamp(floor(extract(epoch from now()) / p_fenetre_s) * p_fenetre_s);
  v_compte int;
begin
  insert into alerterobot.limites (cle, fenetre, compte) values (left(p_cle, 200), v_fenetre, 1)
  on conflict (cle, fenetre) do update set compte = alerterobot.limites.compte + 1
  returning compte into v_compte;
  return v_compte <= p_max;
end;
$$;

-- Rétention : vérifications 90 jours, comme annoncé dans le besoin.
create function alerterobot.purger() returns void
language sql security definer set search_path = '' as $$
  delete from alerterobot.verifications where le < now() - interval '90 days';
  delete from alerterobot.limites where fenetre < now() - interval '1 day';
  delete from alerterobot.jetons_vu where expire_le < now() - interval '7 days';
  delete from alerterobot.notifications where cree_le < now() - interval '180 days';
$$;

-- Applique les quotas d'un forfait. Appelée après un paiement validé (lot suivant).
create function alerterobot.appliquer_forfait(p_org uuid, p_forfait alerterobot.forfait) returns void
language sql security definer set search_path = '' as $$
  update alerterobot.organisations set
    forfait = p_forfait,
    moniteurs_max = case p_forfait when 'decouverte' then 1 when 'essentiel' then 5 when 'pro' then 20 else 100 end,
    intervalle_min_s = case p_forfait when 'decouverte' then 300 when 'essentiel' then 180 else 60 end,
    contacts_max = case p_forfait when 'decouverte' then 1 when 'essentiel' then 2 when 'pro' then 3 else 10 end
  where id = p_org;
  select alerterobot._journal(p_org, 'forfait', p_forfait::text);
$$;

-- ---------------------------------------------------------------- Fonctions des membres (authenticated)

-- Crée une organisation, inscrit l'appelant comme propriétaire et comme premier contact.
create function alerterobot.creer_organisation(p_nom text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_email text;
  v_contact uuid;
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if (select count(*) from alerterobot.membres where user_id = v_uid and role = 'proprietaire') >= 3 then
    raise exception 'Limite de 3 organisations par compte.' using errcode = 'P0001';
  end if;
  insert into alerterobot.organisations (nom) values (trim(p_nom)) returning id into v_org;
  insert into alerterobot.membres (org_id, user_id, role) values (v_org, v_uid, 'proprietaire');
  select email into v_email from auth.users where id = v_uid;
  insert into alerterobot.contacts (org_id, nom, email, user_id)
  values (v_org, coalesce(nullif(split_part(v_email, '@', 1), ''), 'Moi'), v_email, v_uid)
  returning id into v_contact;
  perform alerterobot._journal(v_org, 'organisation_creee', v_org::text);
  return v_org;
end;
$$;

-- Nouveau jeton de heartbeat. Le jeton en clair n'est rendu qu'une fois.
create function alerterobot.regenerer_heartbeat(p_moniteur uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_m alerterobot.moniteurs;
  v_jeton text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  select * into v_m from alerterobot.moniteurs where id = p_moniteur for update;
  if not found or not alerterobot.peut_ecrire(v_m.org_id) or v_m.type <> 'heartbeat' then
    raise exception 'Moniteur introuvable.' using errcode = '42501';
  end if;
  update alerterobot.moniteurs set heartbeat_jeton_hash = extensions.digest(v_jeton, 'sha256') where id = p_moniteur;
  perform alerterobot._journal(v_m.org_id, 'heartbeat_regenere', p_moniteur::text);
  return v_jeton;
end;
$$;

-- « J'ai vu » depuis le tableau de bord.
create function alerterobot.accuser_reception(p_incident uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_inc alerterobot.incidents;
  v_email text;
begin
  select * into v_inc from alerterobot.incidents where id = p_incident for update;
  if not found or not alerterobot.peut_ecrire(v_inc.org_id) then
    raise exception 'Incident introuvable.' using errcode = '42501';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  update alerterobot.incidents set vu_le = coalesce(vu_le, now()), vu_par = coalesce(vu_par, v_email) where id = p_incident;
  update alerterobot.notifications set statut = 'ignoree'
  where incident_id = p_incident and statut = 'a_envoyer' and type in ('rappel', 'escalade');
  perform alerterobot._journal(v_inc.org_id, 'incident_vu', p_incident::text);
end;
$$;

-- Enregistre l'abonnement Web Push du navigateur courant.
create function alerterobot.enregistrer_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  insert into alerterobot.abonnements_push (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- ---------------------------------------------------------------- Page de statut publique

-- Ne renvoie que ce qui est affiché publiquement : jamais d'URL, de cause technique ni de contact.
create function alerterobot.statut_public(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_client alerterobot.clients;
  v_debut timestamptz := date_trunc('day', now()) - interval '89 days';
  v_services jsonb;
  v_incidents jsonb;
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
      'service', m.nom, 'debut', i.debut, 'fin', i.fin) order by i.debut desc), '[]')
  into v_incidents
  from alerterobot.incidents i join alerterobot.moniteurs m on m.id = i.moniteur_id
  where m.client_id = v_client.id and m.public and i.debut > v_debut and not i.en_maintenance;

  return jsonb_build_object('nom', v_client.nom, 'services', v_services, 'incidents', v_incidents);
end;
$$;

-- ---------------------------------------------------------------- Droits d'exécution

do $$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text from pg_proc p
    where p.pronamespace = 'alerterobot'::regnamespace and p.prokind = 'f'
      and p.proname not in ('est_membre', 'peut_ecrire', 'peut_gerer')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

grant execute on function alerterobot.creer_organisation(text) to authenticated;
grant execute on function alerterobot.regenerer_heartbeat(uuid) to authenticated;
grant execute on function alerterobot.accuser_reception(uuid) to authenticated;
grant execute on function alerterobot.enregistrer_push(text, text, text) to authenticated;
