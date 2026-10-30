# AlerteRobot

Surveillance de sites, API et paiements mobile money depuis Abidjan et Paris, avec alertes **email et push**.
Lot 1 : comptes, organisations, moniteurs, vérifications, moteur d'incidents, alertes, tableau de bord, page de statut.

## Composants

| Partie | Rôle | Où |
|---|---|---|
| Application Next 16 | Tableau de bord, page de statut, heartbeat, « J'ai vu » | `src/` |
| Worker de vérification | Un par lieu (VPS Afrique de l'Ouest, VPS Europe) | `worker/verificateur.ts` |
| Notifieur | Envoi email (Resend) et push (VAPID), rappels, escalade, purge | `worker/notifieur.ts` |
| Base Supabase | Données, RLS, moteur d'incidents en SQL | `supabase/migrations/` |

Le moteur d'incidents vit dans PostgreSQL (`enregistrer_verification`, `planifier_relances`) : une panne n'est
confirmée que si les deux lieux échouent (ou le même après 3 min si l'autre worker est muet), et les deux workers
ne peuvent pas se contredire puisque chaque résultat verrouille la ligne du moniteur.

## Démarrer

1. Créer un projet Supabase dédié, appliquer `supabase/migrations/0001_socle.sql` puis `0002_moteur.sql`.
2. `cp .env.example .env.local` et remplir les clés ; `npm run vapid` pour les clés push.
3. `npm install`, puis `npm run dev` (port 3500), `npm run worker:abidjan`, `npm run worker:paris`, `npm run worker:notifieur`.

Tests : `npm test` (garde anti-SSRF, textes d'alerte), `npm run test:sql` (RLS, droits, moteur — PostgreSQL 18 local).

## Sécurité

- **Isolation des clients** : RLS sur toutes les tables, `anon` n'a accès à rien ; écritures autorisées colonne par
  colonne (l'état, le forfait et les quotas ne sont modifiables que par le moteur) ; fonctions `security definer`
  avec `search_path` vide et `EXECUTE` retiré à `PUBLIC`.
- **SSRF** : les adresses surveillées sont contrôlées à la saisie, à chaque redirection et à chaque connexion
  (toutes les IP résolues doivent être publiques : métadonnées cloud, réseau privé, IPv6 locale et IPv4 encapsulée refusés).
- **Secrets** : jetons heartbeat et « J'ai vu » de 192 bits, stockés en SHA-256 uniquement ; « J'ai vu » à usage
  unique, 24 h, confirmé par un clic (les antivirus de messagerie ouvrent les liens) ; clé `service_role` jamais
  envoyée au navigateur.
- **Web** : CSP à nonce par requête, sans style ni script en ligne ; HSTS, `X-Frame-Options: DENY`, `nosniff`,
  `Permissions-Policy` ; le navigateur ne parle qu'à notre serveur (`connect-src 'self'`).
- **Comptes** : mot de passe de 12 caractères au moins, messages identiques que le compte existe ou non,
  limiteur de débit (connexion, inscription, heartbeat, « J'ai vu ») qui refuse si la base ne répond pas.
- **Données** : vérifications purgées après 90 jours, notifications après 180 ; page de statut sans URL, cause ni contact.
- **Emails** : noms échappés, rappel anti-hameçonnage en pied de message.

## Fonctions inspirées des plateformes de référence

| Fonction | Inspiration | Où |
|---|---|---|
| Chronologie d'incident, mises à jour publiques, abonnés email (double opt-in) | Statuspage, Instatus | `/incidents/[id]`, `/statut/[slug]`, migration 0005 |
| Capture de l'erreur (code, extrait, DNS, première réponse, IP) | Better Stack | `worker/sonde.ts`, page d'incident |
| Maintenances programmées et annoncées | UptimeRobot, Statuspage | `/maintenances` |
| Escalade par niveaux et jours d'astreinte | Better Stack | `/alertes` |
| Heartbeat `/start`, `/fail`, durée, tâche bloquée | Healthchecks.io, Cronitor | `/api/heartbeat/<jeton>[/start\|/fail]`, migration 0006 |
| Rapport mensuel imprimable, envoyé le 1er | UptimeRobot | `/rapports`, notifieur |
| Webhook signé (HMAC, horodaté) et Telegram | Stripe (signature), Better Stack | `/integrations`, notifieur |

Webhook : en-tête `AlerteRobot-Signature: t=<horodatage>,v1=<HMAC-SHA256 hex de "t.corps">`. Le destinataire
recalcule le HMAC avec le secret affiché à la création et refuse un horodatage de plus de 5 minutes.

## Reste à faire

Invitations de membres et rôles, paiement mobile money, MFA (TOTP Supabase) pour les propriétaires, vérification
DNS et expiration de domaine, robot Telegram à créer (@BotFather) puis `TELEGRAM_BOT_TOKEN` et `TELEGRAM_BOT_NOM`.
