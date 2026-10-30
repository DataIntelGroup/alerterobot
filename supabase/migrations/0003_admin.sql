-- AlerteRobot — console d'administration de la plateforme (abonnés, performances, journal).
-- Ces fonctions lisent toutes les organisations : elles ne sont exécutables que par
-- service_role, et le serveur ne les appelle qu'après avoir vérifié que la session
-- appartient à un administrateur (ALERTEROBOT_ADMIN_EMAILS).

create index verifications_lieu on alerterobot.verifications (lieu, le desc);
create index journal_audit_le on alerterobot.journal_audit (le desc);

-- Prix mensuels des forfaits, en FCFA : une seule source pour le revenu estimé.
create function alerterobot._prix_mensuel(p_forfait alerterobot.forfait) returns int
language sql immutable set search_path = '' as $$
  select case p_forfait when 'essentiel' then 5000 when 'pro' then 15000 when 'agence' then 40000 else 0 end;
$$;

create function alerterobot.admin_console() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'genere_le', now(),
    'abonnes', (
      select jsonb_build_object(
        'total', count(*),
        'payants', count(*) filter (where forfait <> 'decouverte'),
        'nouveaux_7j', count(*) filter (where cree_le > now() - interval '7 days'),
        'nouveaux_30j', count(*) filter (where cree_le > now() - interval '30 days'),
        'revenu_mensuel', coalesce(sum(alerterobot._prix_mensuel(forfait)), 0),
        'par_forfait', (select coalesce(jsonb_object_agg(f.forfait, f.n), '{}')
                        from (select forfait, count(*) n from alerterobot.organisations group by forfait) f))
      from alerterobot.organisations),
    'utilisateurs', (select count(distinct user_id) from alerterobot.membres),
    'moniteurs', (
      select jsonb_build_object(
        'total', count(*), 'actifs', count(*) filter (where actif),
        'panne', count(*) filter (where etat = 'panne'), 'lent', count(*) filter (where etat = 'lent'),
        'par_type', (select coalesce(jsonb_object_agg(t.type, t.n), '{}')
                     from (select type, count(*) n from alerterobot.moniteurs group by type) t))
      from alerterobot.moniteurs),
    'lieux', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'lieu', l,
        'derniere', (select max(v.le) from alerterobot.verifications v where v.lieu = l),
        'verifs_1h', (select count(*) from alerterobot.verifications v where v.lieu = l and v.le > now() - interval '1 hour'),
        'echecs_1h', (select count(*) from alerterobot.verifications v where v.lieu = l and v.le > now() - interval '1 hour' and not v.ok),
        'ms_moyen_1h', (select round(avg(v.ms)) from alerterobot.verifications v where v.lieu = l and v.le > now() - interval '1 hour' and v.ok),
        'en_retard', (select count(*) from alerterobot.planning p join alerterobot.moniteurs m on m.id = p.moniteur_id
                      where p.lieu = l and m.actif and p.prochaine_le < now() - interval '2 minutes')
      ) order by l), '[]')
      from unnest(enum_range(null::alerterobot.lieu)) l),
    'alertes_24h', (
      select jsonb_build_object(
        'envoyees', count(*) filter (where statut = 'envoyee'),
        'echecs', count(*) filter (where statut = 'echec'),
        'en_attente', count(*) filter (where statut in ('a_envoyer', 'envoi') and envoyer_apres <= now() - interval '1 minute'),
        'email', count(*) filter (where canal = 'email' and statut = 'envoyee'),
        'push', count(*) filter (where canal = 'push' and statut = 'envoyee'))
      from alerterobot.notifications where cree_le > now() - interval '24 hours'),
    -- Délai entre le premier échec constaté et l'alerte remise : la promesse est « moins de 5 minutes ».
    'delai_alerte_s', (
      select jsonb_build_object(
        'moyen', round(avg(extract(epoch from n.envoye_le - i.debut))),
        'p95', round(percentile_cont(0.95) within group (order by extract(epoch from n.envoye_le - i.debut))))
      from alerterobot.notifications n join alerterobot.incidents i on i.id = n.incident_id
      where n.type = 'panne' and n.statut = 'envoyee' and n.cree_le > now() - interval '30 days'),
    'incidents', (
      select jsonb_build_object(
        'ouverts', count(*) filter (where fin is null),
        'trente_jours', count(*) filter (where debut > now() - interval '30 days'),
        'duree_mediane_min', round((percentile_cont(0.5) within group (order by extract(epoch from fin - debut)) filter (where fin is not null and debut > now() - interval '30 days')) / 60))
      from alerterobot.incidents),
    'faux_positifs_7j', (select count(*) from alerterobot.journal_audit where action = 'faux_positif_evite' and le > now() - interval '7 days')
  );
$$;

create function alerterobot.admin_abonnes(p_forfait alerterobot.forfait default null, p_recherche text default null)
returns table (id uuid, nom text, forfait alerterobot.forfait, cree_le timestamptz, proprietaire text, membres bigint,
               moniteurs bigint, moniteurs_max int, en_panne bigint, incidents_30j bigint, derniere_verif timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.nom, o.forfait, o.cree_le,
    (select u.email from alerterobot.membres m join auth.users u on u.id = m.user_id
     where m.org_id = o.id and m.role = 'proprietaire' order by m.cree_le limit 1)::text,
    (select count(*) from alerterobot.membres m where m.org_id = o.id),
    (select count(*) from alerterobot.moniteurs mo where mo.org_id = o.id),
    o.moniteurs_max,
    (select count(*) from alerterobot.moniteurs mo where mo.org_id = o.id and mo.etat = 'panne'),
    (select count(*) from alerterobot.incidents i where i.org_id = o.id and i.debut > now() - interval '30 days'),
    (select max(mo.derniere_verif) from alerterobot.moniteurs mo where mo.org_id = o.id)
  from alerterobot.organisations o
  where (p_forfait is null or o.forfait = p_forfait)
    and (p_recherche is null or o.nom ilike '%' || replace(replace(replace(left(p_recherche, 80), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  order by o.cree_le desc
  limit 500;
$$;

-- Journal unifié : actions des comptes, décisions du moteur et envois en échec.
create function alerterobot.admin_journal(p_action text default null, p_limite int default 200)
returns table (le timestamptz, action text, organisation text, utilisateur text, cible text, details jsonb)
language sql stable security definer set search_path = '' as $$
  select * from (
    select j.le, j.action, o.nom, u.email::text, j.cible, j.details
    from alerterobot.journal_audit j
    left join alerterobot.organisations o on o.id = j.org_id
    left join auth.users u on u.id = j.user_id
    union all
    select n.cree_le, 'envoi_echec', o.nom, null, n.canal || ' · ' || n.type, jsonb_build_object('erreur', n.erreur, 'tentatives', n.tentatives)
    from alerterobot.notifications n
    join alerterobot.organisations o on o.id = n.org_id
    where n.statut = 'echec'
  ) t
  where p_action is null or t.action = p_action
  order by t.le desc
  limit least(greatest(p_limite, 1), 500);
$$;

revoke execute on function alerterobot._prix_mensuel(alerterobot.forfait) from public, anon, authenticated;
revoke execute on function alerterobot.admin_console() from public, anon, authenticated;
revoke execute on function alerterobot.admin_abonnes(alerterobot.forfait, text) from public, anon, authenticated;
revoke execute on function alerterobot.admin_journal(text, int) from public, anon, authenticated;
grant execute on function alerterobot._prix_mensuel(alerterobot.forfait) to service_role;
grant execute on function alerterobot.admin_console() to service_role;
grant execute on function alerterobot.admin_abonnes(alerterobot.forfait, text) to service_role;
grant execute on function alerterobot.admin_journal(text, int) to service_role;
