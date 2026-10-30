import webpush from "web-push";
import { arretDemande, attendre, base, journal } from "./base.ts";
import { composerGroupe, corpsWebhook, emailHtml, emailTexte, regrouper, signatureWebhook, texteTelegram, type Envoi, type Message } from "./messages.ts";
import { posterSur } from "./sonde.ts";
import { echapper, emailStatut, envoyerEmail as envoyerEmailPartage } from "../src/lib/email/envoyer.ts";
import { signer } from "../src/lib/liens-signes.ts";

/**
 * Notifieur : un seul processus suffit (les réservations SQL sont exclusives,
 * on peut en lancer deux sans doublon). Toutes les 5 s il envoie les alertes
 * dues ; chaque minute il planifie rappels, escalades et heartbeats en retard ;
 * chaque heure il purge les données expirées.
 */

const APP_URL = (process.env.APP_URL ?? "http://localhost:3500").replace(/\/$/, "");
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const db = base();
const arreter = arretDemande();

const vapidPret = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (vapidPret) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:securite@example.invalid",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
}

async function envoyerEmail(destinataire: string, m: Message): Promise<void> {
  await envoyerEmailPartage({ a: destinataire, sujet: m.objet, html: emailHtml(m, APP_URL), texte: emailTexte(m) });
}

// Telegram : le robot d'AlerteRobot (TELEGRAM_BOT_TOKEN) écrit dans les groupes reliés.
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
let decalageTelegram = 0;

async function appelTelegram(methode: string, corps: Record<string, unknown>): Promise<unknown> {
  if (!TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN absent");
  const rep = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${methode}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps), signal: AbortSignal.timeout(15_000),
  });
  const json = (await rep.json().catch(() => null)) as { ok?: boolean; result?: unknown; description?: string } | null;
  if (!json?.ok) throw new Error(`Telegram ${rep.status}`); // jamais l'URL : elle contient le jeton du robot
  return json.result;
}

/** Relie un groupe quand quelqu'un y envoie « /start <code> » (code affiché dans Intégrations). */
async function relierTelegram(): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  const maj = (await appelTelegram("getUpdates", { offset: decalageTelegram, timeout: 0, allowed_updates: ["message"] })) as
    { update_id: number; message?: { text?: string; chat: { id: number } } }[];
  for (const u of maj) {
    decalageTelegram = u.update_id + 1;
    const code = u.message?.text?.match(/^\/start(?:@\w+)?\s+([0-9a-f]{24})$/)?.[1];
    if (!code || !u.message) continue;
    const { data } = await db.rpc("lier_telegram", { p_code: code, p_chat_id: u.message.chat.id });
    await appelTelegram("sendMessage", {
      chat_id: u.message.chat.id,
      text: data ? `C'est relié : ce groupe recevra les alertes de ${data}.` : "Ce code a expiré ou a déjà servi. Générez-en un nouveau dans AlerteRobot, rubrique Intégrations.",
    }).catch(() => undefined);
  }
}

// Rapport mensuel : le 1er du mois, résumé par email aux contacts de niveau 1, lien vers le rapport complet.
type RapportService = { nom: string; client: string; disponibilite: number; incidents: number; minutes_panne: number };

async function envoyerRapports(): Promise<void> {
  const { data, error } = await db.rpc("rapports_a_envoyer");
  if (error) { journal("erreur", "rapports impossibles", { code: error.code }); return; }
  for (const r of (data ?? []) as { org_id: string; org_nom: string; mois: string; emails: string[] }[]) {
    const { data: rapport } = await db.rpc("rapport_mensuel", { p_org: r.org_id, p_mois: r.mois });
    const services = ((rapport as { services?: RapportService[] } | null)?.services ?? []);
    const nomMois = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${r.mois}T00:00:00Z`));
    const incidents = services.reduce((s, x) => s + x.incidents, 0);
    const moyenne = services.length ? services.reduce((s, x) => s + Number(x.disponibilite), 0) / services.length : 100;
    const lien = `${APP_URL}/rapports?mois=${r.mois.slice(0, 7)}`;
    const resume = `Disponibilité moyenne de vos ${services.length} service${services.length > 1 ? "s" : ""} : ${moyenne.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %. ${incidents ? `${incidents} incident${incidents > 1 ? "s" : ""} au total.` : "Aucun incident ce mois-ci."}`;
    for (const email of r.emails) {
      await envoyerEmailPartage({
        a: email,
        sujet: `Votre rapport de ${nomMois} · ${r.org_nom}`,
        html: emailStatut({ titre: `Rapport de ${nomMois}`, corps: resume, bouton: { lien, texte: "Voir le rapport complet" }, pied: "Rapport mensuel AlerteRobot, envoyé aux contacts de niveau 1." }),
        texte: `Rapport de ${nomMois}\n\n${resume}\n\nRapport complet : ${lien}`,
      }).catch((e) => journal("erreur", "rapport non envoyé", { erreur: String(e) }));
    }
    await db.rpc("marquer_rapport_envoye", { p_org: r.org_id, p_mois: r.mois });
    journal("info", "rapport mensuel envoyé", { mois: r.mois, destinataires: r.emails.length });
  }
}

// Emails aux abonnés des pages de statut : mise à jour d'incident ou maintenance annoncée.
type EnvoiAbonne = { id: string; abonne_id: string; email: string; client_nom: string; slug: string | null; sujet: string; corps: string };

async function envoyerAbonnes(): Promise<number> {
  const secret = process.env.ALERTEROBOT_SECRET_LIENS ?? "";
  if (secret.length < 32) return 0;
  const { data, error } = await db.rpc("reserver_envois_abonnes", { p_limite: 50 });
  if (error) { journal("erreur", "réservation des envois aux abonnés impossible", { code: error.code }); return 0; }
  const envois = (data ?? []) as EnvoiAbonne[];
  for (const e of envois) {
    const desabonnement = `${APP_URL}/statut/desabonner?j=${signer("desabonner", e.abonne_id, secret)}`;
    const page = e.slug ? `${APP_URL}/statut/${e.slug}` : APP_URL;
    let erreur: string | null = null;
    try {
      await envoyerEmailPartage({
        a: e.email,
        sujet: e.sujet,
        html: emailStatut({
          titre: e.sujet.replace(/^\[[^\]]+\]\s*/, ""),
          corps: e.corps,
          bouton: { lien: page, texte: "Voir l'état des services" },
          pied: `Vous recevez cet email car vous suivez l'état des services de ${echapper(e.client_nom)}. <a href="${echapper(desabonnement)}" style="color:#0e6b47">Ne plus recevoir ces emails</a>`,
        }),
        texte: `${e.sujet}\n\n${e.corps}\n\nÉtat des services : ${page}\nSe désabonner : ${desabonnement}`,
        desabonnement: `${APP_URL}/api/desabonner?j=${signer("desabonner", e.abonne_id, secret)}`,
      });
    } catch (err) {
      erreur = err instanceof Error ? err.message : "erreur inconnue";
    }
    await db.rpc("marquer_envoi_abonne", { p_id: e.id, p_ok: erreur === null, p_erreur: erreur });
  }
  return envois.length;
}

async function envoyerPush(userId: string, m: Message): Promise<void> {
  if (!vapidPret) throw new Error("clés VAPID absentes");
  const { data: abonnements, error } = await db.from("abonnements_push").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (error) throw new Error(`abonnements : ${error.code}`);
  if (!abonnements?.length) throw new Error("aucun appareil abonné");
  // Le jeton voyage chiffré de bout en bout (Web Push, RFC 8291) : le service push ne le lit pas.
  const charge = JSON.stringify({ titre: m.titre, corps: m.corps, tag: m.tag, url: m.lienDetail, lienVu: m.lienVu });
  let reussis = 0;
  for (const a of abonnements) {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, charge, { TTL: 3600, urgency: "high" });
      reussis++;
    } catch (e) {
      const statut = (e as { statusCode?: number }).statusCode;
      if (statut === 404 || statut === 410) await db.from("abonnements_push").delete().eq("id", a.id); // appareil désabonné
    }
  }
  if (!reussis) throw new Error("aucun appareil joignable");
}

async function envoyerGroupe(groupe: Envoi[]) {
  const premier = groupe[0];
  const m = composerGroupe(groupe, APP_URL);
  let erreur: string | null = null;
  try {
    if (premier.canal === "email") {
      if (!premier.email) throw new Error("contact sans email");
      await envoyerEmail(premier.email, m);
    } else if (premier.canal === "push") {
      if (!premier.user_id) throw new Error("contact sans compte");
      await envoyerPush(premier.user_id, m);
    } else if (premier.canal === "webhook") {
      if (!premier.integration_url || !premier.integration_secret) throw new Error("webhook incomplet");
      const corps = corpsWebhook(premier, APP_URL);
      const statut = await posterSur(premier.integration_url, corps, { "AlerteRobot-Signature": signatureWebhook(premier.integration_secret, corps) });
      if (statut < 200 || statut >= 300) throw new Error(`webhook ${statut}`);
    } else {
      if (!premier.telegram_chat_id) throw new Error("groupe Telegram non relié");
      await appelTelegram("sendMessage", { chat_id: premier.telegram_chat_id, text: texteTelegram(premier, APP_URL), disable_web_page_preview: true });
    }
  } catch (e) {
    erreur = e instanceof Error ? e.message : "erreur inconnue";
  }
  await Promise.all(groupe.map((e) => db.rpc("marquer_notification", { p_id: e.id, p_ok: erreur === null, p_erreur: erreur })));
  journal(erreur ? "erreur" : "info", erreur ? "envoi en échec" : "alerte envoyée", { canal: premier.canal, type: premier.type, nb: groupe.length, erreur });
}

async function envoyerDues(): Promise<number> {
  const { data, error } = await db.rpc("reserver_notifications", { p_limite: 50 });
  if (error) { journal("erreur", "réservation des envois impossible", { code: error.code }); return 0; }
  const envois = (data ?? []) as Envoi[];
  for (const groupe of regrouper(envois)) await envoyerGroupe(groupe);
  return envois.length;
}

let derniereRelance = 0;
let dernierePurge = 0;
journal("info", "notifieur démarré", { email: Boolean(RESEND_API_KEY), push: vapidPret });
while (!arreter()) {
  try {
    if (Date.now() - derniereRelance >= 60_000) {
      derniereRelance = Date.now();
      const { data, error } = await db.rpc("planifier_relances");
      if (error) journal("erreur", "relances impossibles", { code: error.code });
      else if (data) journal("info", "relances planifiées", { nb: data });
    }
    if (Date.now() - dernierePurge >= 3_600_000) {
      dernierePurge = Date.now();
      const { error } = await db.rpc("purger");
      if (error) journal("erreur", "purge impossible", { code: error.code });
      await envoyerRapports();
    }
    await relierTelegram().catch((e) => journal("erreur", "Telegram injoignable", { erreur: String(e) }));
    const nb = await envoyerDues();
    const nbAbonnes = await envoyerAbonnes();
    await attendre(nb >= 50 || nbAbonnes >= 50 ? 0 : 5000);
  } catch (e) {
    journal("erreur", "tour en échec", { erreur: String(e) });
    await attendre(5000);
  }
}
journal("info", "notifieur arrêté");
