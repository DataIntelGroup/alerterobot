-- Tests du socle : isolation entre organisations, droits par colonne, moteur d'incidents.
-- Lancer après prelude-local.sql et les migrations (scripts/test-sql.ps1).
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'awa@boutique.test'),
  ('00000000-0000-0000-0000-00000000000b', 'intrus@ailleurs.test');

create function pg_temp.en_tant_que(p_role text, p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid, ''), false);
  execute format('set role %I', p_role);
end $$;

create function pg_temp.verifier(p_ok boolean, p_message text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'ÉCHEC : %', p_message; end if;
  raise notice 'ok : %', p_message;
end $$;

-- 1. Création d'une organisation par Awa ------------------------------------
select pg_temp.en_tant_que('authenticated', '00000000-0000-0000-0000-00000000000a');
select alerterobot.creer_organisation('Boutique Exemple') as org \gset
select set_config('test.org', :'org', false);
insert into alerterobot.moniteurs (org_id, nom, type, url, seuil_lent_ms)
  values (:'org', 'Paiement mobile money', 'http', 'https://paiement.boutique.test', 1500);
select id as mon from alerterobot.moniteurs \gset
do $$ begin
  perform 1 from alerterobot.planning;
  raise exception 'ÉCHEC : planning lisible';
exception when insufficient_privilege then raise notice 'ok : planning réservé au moteur';
end $$;

-- Quota du forfait Découverte : 1 moniteur.
do $$ begin
  insert into alerterobot.moniteurs (org_id, nom, type, url)
    select id, 'Deuxième', 'http', 'https://b.test' from alerterobot.organisations;
  raise exception 'ÉCHEC : le quota aurait dû bloquer';
exception when sqlstate 'P0001' then raise notice 'ok : quota de moniteurs appliqué';
end $$;

-- L'état n'est pas modifiable par un membre.
do $$ begin
  update alerterobot.moniteurs set etat = 'ok';
  raise exception 'ÉCHEC : etat modifiable';
exception when insufficient_privilege then raise notice 'ok : etat réservé au moteur';
end $$;

-- Le forfait n'est pas modifiable par un membre.
do $$ begin
  update alerterobot.organisations set forfait = 'agence', moniteurs_max = 1000;
  raise exception 'ÉCHEC : forfait modifiable';
exception when insufficient_privilege then raise notice 'ok : forfait non modifiable';
end $$;

-- Le contact créé d'office est rattaché au moniteur.
-- Le contact créé d'office est déjà rattaché au moniteur (déclencheur du lot 1).
select pg_temp.verifier((select count(*) from alerterobot.moniteur_contacts where moniteur_id = :'mon') = 1, 'contact rattaché automatiquement au moniteur');

-- 2. Isolation : un autre compte ne voit rien --------------------------------
reset role;
select pg_temp.en_tant_que('authenticated', '00000000-0000-0000-0000-00000000000b');
select pg_temp.verifier((select count(*) from alerterobot.organisations) = 0, 'organisation invisible pour un intrus');
select pg_temp.verifier((select count(*) from alerterobot.moniteurs) = 0, 'moniteurs invisibles pour un intrus');
do $$ begin
  insert into alerterobot.moniteurs (org_id, nom, type, url)
    values ((select '00000000-0000-0000-0000-000000000000'::uuid), 'x', 'http', 'https://x.test');
  raise exception 'ÉCHEC : insertion hors organisation';
exception when insufficient_privilege or foreign_key_violation then raise notice 'ok : insertion refusée hors organisation';
end $$;
do $$ begin
  perform alerterobot.enregistrer_verification(gen_random_uuid(), 'abidjan', false, null, null, 'x');
  raise exception 'ÉCHEC : moteur appelable par un membre';
exception when insufficient_privilege then raise notice 'ok : moteur réservé à service_role';
end $$;

-- 3. anon n'a accès à rien ----------------------------------------------------
reset role;
select pg_temp.en_tant_que('anon', null);
do $$ begin
  perform 1 from alerterobot.moniteurs;
  raise exception 'ÉCHEC : anon lit les moniteurs';
exception when insufficient_privilege then raise notice 'ok : anon sans lecture';
end $$;
do $$ begin
  perform alerterobot.statut_public('x');
  raise exception 'ÉCHEC : anon appelle statut_public';
exception when insufficient_privilege then raise notice 'ok : anon sans RPC';
end $$;

-- 4. Moteur : faux positif évité ---------------------------------------------
reset role;
select pg_temp.en_tant_que('service_role', null);
select pg_temp.verifier(alerterobot.enregistrer_verification(:'mon', 'abidjan', false, null, null, 'Délai dépassé') = 'suspect', 'premier échec : suspect');
select pg_temp.verifier((select prochaine_le <= now() from alerterobot.planning where moniteur_id = :'mon' and lieu = 'paris'), 'Paris revérifie tout de suite');
select pg_temp.verifier(alerterobot.enregistrer_verification(:'mon', 'paris', true, 200, 300, null) = 'ok', 'Paris réussit : retour à ok');
select pg_temp.verifier((select count(*) from alerterobot.incidents) = 0, 'aucun incident pour un faux positif');
select pg_temp.verifier((select count(*) from alerterobot.journal_audit where action = 'faux_positif_evite') = 1, 'faux positif journalisé');

-- 5. Moteur : panne confirmée depuis deux lieux -------------------------------
select alerterobot.enregistrer_verification(:'mon', 'abidjan', false, null, null, 'Délai dépassé');
select pg_temp.verifier(alerterobot.enregistrer_verification(:'mon', 'paris', false, 502, 120, 'Erreur 502') = 'panne', 'deuxième lieu en échec : panne');
select pg_temp.verifier((select lieux from alerterobot.incidents) = 'abidjan,paris', 'incident confirmé depuis les deux lieux');
select pg_temp.verifier((select count(*) from alerterobot.notifications where type = 'panne' and canal = 'email') = 1, 'une alerte email au contact 1');

-- Réservation : rien avant 20 s (regroupement), puis un jeton « J'ai vu ».
select pg_temp.verifier((select count(*) from alerterobot.reserver_notifications(10)) = 0, 'attente de regroupement');
update alerterobot.notifications set cree_le = now() - interval '1 minute';
create temp table envoi as select * from alerterobot.reserver_notifications(10);
select pg_temp.verifier((select count(*) from envoi where jeton ~ '^[0-9a-f]{48}$') = 1, 'jeton « J''ai vu » fourni');
select pg_temp.verifier((select count(*) from alerterobot.jetons_vu where jeton_hash = extensions.digest((select jeton from envoi), 'sha256')) = 1, 'seul le hash du jeton est stocké');
select alerterobot.marquer_notification((select id from envoi), true);

-- Rappel au bout de 15 min sans réponse.
update alerterobot.incidents set derniere_relance = now() - interval '16 minutes';
select pg_temp.verifier(alerterobot.planifier_relances() = 1, 'rappel planifié après 15 min');

-- « J'ai vu » : arrête les rappels, jeton à usage unique.
select pg_temp.verifier((select resultat from alerterobot.confirmer_vu((select jeton from envoi))) = 'ok', 'J''ai vu accepté');
select pg_temp.verifier((select resultat from alerterobot.confirmer_vu((select jeton from envoi))) = 'deja', 'jeton à usage unique');
select pg_temp.verifier((select resultat from alerterobot.confirmer_vu(repeat('0', 48))) = 'invalide', 'jeton inconnu refusé');
select pg_temp.verifier((select count(*) from alerterobot.notifications where type = 'rappel' and statut = 'a_envoyer') = 0, 'rappels annulés après J''ai vu');
update alerterobot.incidents set derniere_relance = now() - interval '16 minutes';
select pg_temp.verifier(alerterobot.planifier_relances() = 0, 'plus de rappel une fois vu');

-- 6. Rétablissement --------------------------------------------------------
select pg_temp.verifier(alerterobot.enregistrer_verification(:'mon', 'abidjan', true, 200, 250, null) = 'ok', 'succès : rétabli');
select pg_temp.verifier((select fin is not null from alerterobot.incidents), 'incident clos');
select pg_temp.verifier((select count(*) from alerterobot.notifications where type = 'retabli') = 1, 'message de rétablissement');

-- 7. Heartbeat ---------------------------------------------------------------
select alerterobot.appliquer_forfait(:'org', 'pro');
reset role;
select pg_temp.en_tant_que('authenticated', '00000000-0000-0000-0000-00000000000a');
insert into alerterobot.moniteurs (org_id, nom, type, heartbeat_periode_s, heartbeat_grace_s)
  values (:'org', 'Sauvegarde nocturne', 'heartbeat', 3600, 600);
select id as hb from alerterobot.moniteurs where type = 'heartbeat' \gset
select alerterobot.regenerer_heartbeat(:'hb') as jeton_hb \gset
reset role;
select pg_temp.en_tant_que('service_role', null);
select pg_temp.verifier(alerterobot.ping_heartbeat(:'jeton_hb'), 'signal accepté');
select pg_temp.verifier(not alerterobot.ping_heartbeat(repeat('a', 48)), 'signal au jeton inconnu refusé');
update alerterobot.moniteurs set dernier_signal = now() - interval '2 hours' where id = :'hb';
select alerterobot.planifier_relances();
select pg_temp.verifier((select etat from alerterobot.moniteurs where id = :'hb') = 'panne', 'heartbeat en retard : panne');
select pg_temp.verifier(alerterobot.ping_heartbeat(:'jeton_hb'), 'nouveau signal');
select pg_temp.verifier((select count(*) from alerterobot.incidents where moniteur_id = :'hb' and fin is null) = 0, 'incident heartbeat clos');

-- 8. Page de statut ------------------------------------------------------------
insert into alerterobot.clients (org_id, nom, slug_statut) values (:'org', 'Boutique Exemple', 'boutique-exemple');
update alerterobot.moniteurs set client_id = (select id from alerterobot.clients), public = true where id = :'mon';
select pg_temp.verifier(jsonb_array_length(alerterobot.statut_public('boutique-exemple')->'services') = 1, 'statut public : un service');
select pg_temp.verifier(jsonb_array_length(alerterobot.statut_public('boutique-exemple')->'services'->0->'jours') = 90, 'statut public : 90 jours');
select pg_temp.verifier(alerterobot.statut_public('boutique-exemple')::text !~ 'paiement\.boutique\.test', 'statut public : aucune URL exposée');

-- 9. Limiteur -----------------------------------------------------------------
select pg_temp.verifier(alerterobot.limiter('test', 2, 60) and alerterobot.limiter('test', 2, 60) and not alerterobot.limiter('test', 2, 60), 'limiteur : 3e appel refusé');

-- 10. Temps de réponse 24 h : réservé aux membres -----------------------------
reset role;
select pg_temp.en_tant_que('authenticated', '00000000-0000-0000-0000-00000000000a');
select pg_temp.verifier((select count(*) from alerterobot.temps_reponse_24h(:'org')) >= 1, 'courbe 24 h visible pour un membre');
reset role;
select pg_temp.en_tant_que('authenticated', '00000000-0000-0000-0000-00000000000b');
select pg_temp.verifier((select count(*) from alerterobot.temps_reponse_24h(:'org')) = 0, 'courbe 24 h vide pour un intrus');
reset role;
select pg_temp.en_tant_que('service_role', null);

-- 11. Console d'administration -------------------------------------------------
select pg_temp.verifier((alerterobot.admin_console()->'abonnes'->>'total')::int = 1, 'admin : une organisation');
select pg_temp.verifier((alerterobot.admin_console()->'abonnes'->>'revenu_mensuel')::int = 15000, 'admin : revenu du forfait Pro');
select pg_temp.verifier((select proprietaire from alerterobot.admin_abonnes()) = 'awa@boutique.test', 'admin : propriétaire affiché');
select pg_temp.verifier((select count(*) from alerterobot.admin_abonnes(null, '100%_')) = 0, 'admin : recherche avec jokers neutralisés');
select pg_temp.verifier((select count(*) from alerterobot.admin_journal('faux_positif_evite')) = 1, 'admin : journal filtré');
reset role;
select pg_temp.en_tant_que('authenticated', '00000000-0000-0000-0000-00000000000a');
do $$ begin
  perform alerterobot.admin_console();
  raise exception 'ÉCHEC : console admin ouverte à un membre';
exception when insufficient_privilege then raise notice 'ok : console admin réservée à service_role';
end $$;

-- 12. Lot 1 : chronologie, abonnés, capture, maintenances, astreinte --------
reset role;
select pg_temp.en_tant_que('service_role', null);
select pg_temp.verifier((select count(*) from alerterobot.incident_maj where etape = 'analyse' and auteur = 'AlerteRobot') >= 1, 'chronologie : ouverture automatique');
select pg_temp.verifier((select count(*) from alerterobot.incident_maj where etape = 'resolu') >= 1, 'chronologie : résolution automatique');

select abonne_id as ab from alerterobot.abonner_statut('boutique-exemple', 'Client@Exemple.test') \gset
select alerterobot.abonner_statut('boutique-exemple', 'client@exemple.test');
select pg_temp.verifier((select count(*) from alerterobot.abonnes_statut) = 1, 'abonné unique malgré la casse');
select pg_temp.verifier((select count(*) from alerterobot.abonner_statut('inconnu', 'x@y.test')) = 0, 'page inconnue : abonnement refusé');

select alerterobot.enregistrer_verification(:'mon', 'abidjan', false, 503, 90, 'Erreur 503', null, '{"extrait": "Service Unavailable", "ttfb_ms": 80}');
select alerterobot.enregistrer_verification(:'mon', 'paris', false, 503, 95, 'Erreur 503');
select pg_temp.verifier((select details->>'extrait' from alerterobot.verifications where code = 503 and lieu = 'abidjan') = 'Service Unavailable', 'capture de l''erreur enregistrée');
select pg_temp.verifier((select count(*) from alerterobot.envois_abonnes) = 0, 'abonné non confirmé : rien envoyé');
select alerterobot.confirmer_abonnement(:'ab');
select id as inc2 from alerterobot.incidents where moniteur_id = :'mon' and fin is null \gset
select set_config('test.inc2', :'inc2', false);

reset role;
select pg_temp.en_tant_que('authenticated', '00000000-0000-0000-0000-00000000000a');
select alerterobot.publier_maj(:'inc2', 'identifie', 'Notre prestataire de paiement ne répond plus.', true);
reset role;
select pg_temp.en_tant_que('authenticated', '00000000-0000-0000-0000-00000000000b');
do $$ begin
  perform alerterobot.publier_maj((select current_setting('test.inc2')::uuid), 'identifie', 'x', true);
  raise exception 'ÉCHEC : mise à jour publiée par un intrus';
exception when insufficient_privilege then raise notice 'ok : mise à jour refusée à un intrus';
end $$;
reset role;
select pg_temp.en_tant_que('service_role', null);
select pg_temp.verifier((select count(*) from alerterobot.envois_abonnes where sujet like '[Mise à jour]%') = 1, 'mise à jour publique envoyée à l''abonné confirmé');
select pg_temp.verifier(jsonb_array_length(alerterobot.statut_public('boutique-exemple')->'incidents'->0->'maj') = 2, 'page de statut : chronologie publique');

insert into alerterobot.maintenances (org_id, debut, fin, motif) values (:'org', now() + interval '1 day', now() + interval '1 day 1 hour', 'Mise à jour du serveur');
select pg_temp.verifier((select count(*) from alerterobot.envois_abonnes where sujet like '[Maintenance prévue]%') = 1, 'maintenance annoncée aux abonnés');
select pg_temp.verifier(jsonb_array_length(alerterobot.statut_public('boutique-exemple')->'maintenances') = 1, 'page de statut : maintenance à venir');

-- Astreinte : le contact 1 n'est pas de garde aujourd'hui, l'alerte passe au niveau 2.
select alerterobot.enregistrer_verification(:'mon', 'abidjan', true, 200, 200, null);
insert into alerterobot.contacts (org_id, nom, email, niveau) values (:'org', 'Moussa', 'moussa@boutique.test', 2);
update alerterobot.contacts set astreinte_jours = array(
  select d::smallint from generate_series(1, 7) d where d <> extract(isodow from now() at time zone 'Africa/Abidjan'))
where nom <> 'Moussa';
select alerterobot.enregistrer_verification(:'mon', 'abidjan', false, null, null, 'Délai dépassé');
select alerterobot.enregistrer_verification(:'mon', 'paris', false, null, null, 'Délai dépassé');
select pg_temp.verifier((select string_agg(c.nom, ',') from alerterobot.notifications n join alerterobot.incidents i on i.id = n.incident_id
  join alerterobot.contacts c on c.id = n.contact_id where i.fin is null and n.type = 'panne') = 'Moussa', 'astreinte : alerte au premier contact de garde');

-- 13. Lot 2 : heartbeat avancé ------------------------------------------------
reset role;
select pg_temp.en_tant_que('service_role', null);
update alerterobot.contacts set astreinte_jours = '{1,2,3,4,5,6,7}';
update alerterobot.moniteurs set heartbeat_duree_max_s = 600 where id = :'hb';
select pg_temp.verifier(alerterobot.ping_heartbeat(:'jeton_hb', 'start'), 'heartbeat : début accepté');
update alerterobot.moniteurs set heartbeat_debut = now() - interval '90 seconds' where id = :'hb';
select pg_temp.verifier(alerterobot.ping_heartbeat(:'jeton_hb', 'ok'), 'heartbeat : fin acceptée');
select pg_temp.verifier((select heartbeat_duree_ms between 89000 and 95000 from alerterobot.moniteurs where id = :'hb'), 'heartbeat : durée mesurée');
select pg_temp.verifier(not alerterobot.ping_heartbeat(:'jeton_hb', 'n_importe_quoi'), 'heartbeat : signal inconnu refusé');
select alerterobot.ping_heartbeat(:'jeton_hb', 'fail', E'Sauvegarde : disque plein\n\u0007');
select pg_temp.verifier((select cause from alerterobot.incidents where moniteur_id = :'hb' and fin is null) = 'La tâche a signalé un échec : Sauvegarde : disque plein', 'heartbeat : échec signalé, message nettoyé');
select alerterobot.ping_heartbeat(:'jeton_hb', 'ok');
select alerterobot.ping_heartbeat(:'jeton_hb', 'start');
update alerterobot.moniteurs set heartbeat_debut = now() - interval '20 minutes' where id = :'hb';
select alerterobot.planifier_relances();
select pg_temp.verifier((select cause from alerterobot.incidents where moniteur_id = :'hb' and fin is null) like 'La tâche tourne depuis plus de 10 min%', 'heartbeat : tâche bloquée détectée');
select alerterobot.ping_heartbeat(:'jeton_hb', 'ok');

-- 14. Lot 2 : intégrations ----------------------------------------------------
reset role;
select pg_temp.en_tant_que('authenticated', '00000000-0000-0000-0000-00000000000a');
select secret as wh_secret from alerterobot.creer_webhook(:'org', 'Slack de l''équipe', 'https://hooks.exemple.test/abc') \gset
select pg_temp.verifier(:'wh_secret' like 'whsec_%', 'webhook : secret rendu à la création');
do $$ begin
  perform secret from alerterobot.integrations;
  raise exception 'ÉCHEC : secret lisible par un membre';
exception when insufficient_privilege then raise notice 'ok : secret illisible pour un membre';
end $$;
select alerterobot.creer_lien_telegram(:'org', 'Groupe astreinte') as code_tg \gset
reset role;
select pg_temp.en_tant_que('authenticated', '00000000-0000-0000-0000-00000000000b');
do $$ begin
  perform alerterobot.creer_webhook((select current_setting('test.org')::uuid), 'x', 'https://x.test');
  raise exception 'ÉCHEC : webhook créé par un intrus';
exception when insufficient_privilege then raise notice 'ok : webhook refusé à un intrus';
end $$;
reset role;
select pg_temp.en_tant_que('service_role', null);
select pg_temp.verifier(alerterobot.lier_telegram(:'code_tg', 123456789) = 'Boutique Exemple', 'telegram : groupe lié par le code');
select pg_temp.verifier(alerterobot.lier_telegram(:'code_tg', 1) is null, 'telegram : code à usage unique');
update alerterobot.notifications set statut = 'envoyee' where statut in ('a_envoyer', 'envoi');
select alerterobot.enregistrer_verification(:'mon', 'abidjan', true, 200, 200, null);
select alerterobot.enregistrer_verification(:'mon', 'abidjan', false, 500, 50, 'Erreur 500');
select alerterobot.enregistrer_verification(:'mon', 'paris', false, 500, 50, 'Erreur 500');
select pg_temp.verifier((select count(*) from alerterobot.notifications where integration_id is not null and type = 'panne' and statut = 'a_envoyer') = 2, 'intégrations : webhook et Telegram prévenus');
update alerterobot.notifications set cree_le = now() - interval '1 minute';
select pg_temp.verifier((select count(*) from alerterobot.reserver_notifications(50) where type = 'panne' and integration_secret like 'whsec_%' and jeton is null) = 1, 'intégrations : secret transmis au notifieur, sans jeton');

-- 15. Lot 2 : rapport mensuel -------------------------------------------------
reset role;
select pg_temp.en_tant_que('authenticated', '00000000-0000-0000-0000-00000000000a');
select pg_temp.verifier(jsonb_array_length(alerterobot.rapport_mensuel(:'org', current_date)->'services') = 2, 'rapport : deux services ce mois-ci');
select pg_temp.verifier((alerterobot.rapport_mensuel(:'org', current_date)->'services'->0->>'disponibilite')::numeric < 100, 'rapport : disponibilité calculée');
reset role;
select pg_temp.en_tant_que('authenticated', '00000000-0000-0000-0000-00000000000b');
do $$ begin
  perform alerterobot.rapport_mensuel((select current_setting('test.org')::uuid), current_date);
  raise exception 'ÉCHEC : rapport lisible par un intrus';
exception when insufficient_privilege then raise notice 'ok : rapport refusé à un intrus';
end $$;
reset role;
select pg_temp.en_tant_que('service_role', null);
select pg_temp.verifier((alerterobot.rapport_mensuel(:'org', current_date)->>'organisation') = 'Boutique Exemple', 'rapport : lisible par le notifieur');

-- 16. Expiration du nom de domaine ---------------------------------------------
reset role;
select pg_temp.en_tant_que('service_role', null);
select alerterobot.enregistrer_domaine(:'mon', 'boutique.test', now() + interval '5 days');
select pg_temp.verifier((select count(*) from alerterobot.notifications where type = 'domaine' and contact_id is not null) >= 1, 'domaine : alerte au palier de 7 jours');
select pg_temp.verifier((select count(*) from alerterobot.notifications where type = 'domaine' and integration_id is not null) = 2, 'domaine : intégrations prévenues');
select alerterobot.enregistrer_domaine(:'mon', 'boutique.test', now() + interval '5 days');
select pg_temp.verifier((select count(*) from alerterobot.notifications where type = 'domaine' and integration_id is not null) = 2, 'domaine : une seule alerte par palier');
select alerterobot.enregistrer_domaine(:'mon', 'boutique.test', now() + interval '300 days');
select pg_temp.verifier((select domaine_palier_notifie is null and domaine = 'boutique.test' from alerterobot.moniteurs where id = :'mon'), 'domaine : renouvelé, paliers remis à zéro');

reset role;
\echo 'Tous les tests SQL sont passés.'
