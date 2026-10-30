-- AlerteRobot — courbe du temps de réponse sur 24 h pour le tableau de bord.
-- Agrégée en base (une ligne par heure et par lieu) : le navigateur ne reçoit jamais
-- les milliers de vérifications brutes.

create function alerterobot.temps_reponse_24h(p_org uuid)
returns table (heure timestamptz, lieu alerterobot.lieu, ms int)
language sql stable security definer set search_path = '' as $$
  select date_trunc('hour', v.le), v.lieu, round(avg(v.ms))::int
  from alerterobot.verifications v
  join alerterobot.moniteurs m on m.id = v.moniteur_id
  where m.org_id = p_org and alerterobot.est_membre(p_org)
    and v.ok and v.ms is not null and v.le > now() - interval '24 hours'
  group by 1, 2
  order by 1, 2;
$$;

revoke execute on function alerterobot.temps_reponse_24h(uuid) from public, anon;
grant execute on function alerterobot.temps_reponse_24h(uuid) to authenticated, service_role;
