import { createHmac } from "node:crypto";

/**
 * Textes des alertes, en français clair : ce qui ne va pas, depuis quand, quoi vérifier.
 * Fonctions pures : aucune entrée réseau, tout est testé dans messages.test.ts.
 * Les noms de moniteurs et de clients sont saisis par les clients : échappés dans le HTML.
 */

export type Envoi = {
  id: string;
  canal: "email" | "push" | "webhook" | "telegram";
  type: "panne" | "rappel" | "escalade" | "retabli" | "lenteur" | "ssl" | "domaine";
  domaine?: string | null;
  domaine_expire_le?: string | null;
  contact_id: string | null;
  contact_nom: string | null;
  integration_id?: string | null;
  integration_url?: string | null;
  integration_secret?: string | null;
  telegram_chat_id?: number | null;
  email: string | null;
  user_id: string | null;
  moniteur_id: string;
  moniteur_nom: string;
  moniteur_url: string | null;
  client_nom: string | null;
  incident_id: string | null;
  debut: string | null;
  fin: string | null;
  cause: string | null;
  lieux: string | null;
  escalade_niveau: number | null;
  ssl_expire_le: string | null;
  dernier_ms: number | null;
  seuil_lent_ms: number | null;
  jeton: string | null;
};

export type Message = {
  objet: string;
  titre: string;
  corps: string;
  conseil: string | null;
  lienVu: string | null;
  lienDetail: string;
  tag: string;
};

const FUSEAU = "Africa/Abidjan";

export function duree(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const reste = min % 60;
  return reste ? `${h} h ${String(reste).padStart(2, "0")}` : `${h} h`;
}

export function heure(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: FUSEAU }).format(new Date(iso));
}

function lieuxLisibles(lieux: string | null): string | null {
  if (!lieux || lieux === "heartbeat") return null;
  const noms = lieux.split(",").map((l) => (l === "abidjan" ? "Abidjan" : l === "paris" ? "Paris" : l));
  return noms.length > 1 ? `${noms.slice(0, -1).join(", ")} et ${noms.at(-1)}` : noms[0];
}

export function conseil(cause: string | null): string | null {
  if (!cause) return null;
  if (cause.includes("DNS")) return "la configuration DNS et la date d'expiration du nom de domaine";
  if (cause.includes("Certificat")) return "le renouvellement du certificat SSL";
  if (cause.includes("Mot-clé")) return "le contenu de la page : elle affiche peut-être une erreur";
  if (cause.includes("JSON")) return "la dernière mise en production de l'API";
  if (cause.includes("signal")) return "la tâche planifiée et ses journaux";
  if (/Erreur 5\d\d|Délai|refusée|coupée/.test(cause)) return "l'hébergeur, le serveur et, pour un paiement, le statut de votre agrégateur";
  return null;
}

function nomComplet(e: Envoi): string {
  return e.client_nom ? `${e.moniteur_nom} (${e.client_nom})` : e.moniteur_nom;
}

export function composer(e: Envoi, appUrl: string, maintenant = new Date()): Message {
  const nom = nomComplet(e);
  const depuis = e.debut ? duree(maintenant.getTime() - new Date(e.debut).getTime()) : null;
  const lieux = lieuxLisibles(e.lieux);
  const lienDetail = e.incident_id ? `${appUrl}/incidents/${e.incident_id}` : `${appUrl}/tableau-de-bord`;
  const lienVu = e.jeton ? `${appUrl}/vu/${e.jeton}` : null;
  const tag = e.incident_id ?? `${e.moniteur_id}-${e.type}`;
  const cause = e.cause ? `${e.cause}.` : "";

  switch (e.type) {
    case "panne":
      return {
        objet: `[PANNE] ${nom}`,
        titre: `Panne · ${e.moniteur_nom}`,
        corps: `${nom} ne répond plus depuis ${depuis}. ${cause}${lieux ? ` Confirmé depuis ${lieux}.` : ""}`.replace(/\s+/g, " ").trim(),
        conseil: conseil(e.cause), lienVu, lienDetail, tag,
      };
    case "rappel":
      return {
        objet: `[RAPPEL] ${nom} toujours en panne`,
        titre: `Rappel · ${e.moniteur_nom}`,
        corps: `${nom} est toujours en panne, depuis ${depuis}. Répondez « J'ai vu » pour arrêter les rappels.`,
        conseil: conseil(e.cause), lienVu, lienDetail, tag,
      };
    case "escalade":
      return {
        objet: `[PANNE] ${nom} — personne n'a encore répondu`,
        titre: `Panne sans réponse · ${e.moniteur_nom}`,
        corps: `${nom} est en panne depuis ${depuis} et personne n'a encore répondu. Vous êtes le contact suivant.`,
        conseil: conseil(e.cause), lienVu, lienDetail, tag,
      };
    case "retabli": {
      const total = e.debut && e.fin ? duree(new Date(e.fin).getTime() - new Date(e.debut).getTime()) : null;
      return {
        objet: `[RÉTABLI] ${nom}`,
        titre: `Rétabli · ${e.moniteur_nom}`,
        corps: `${nom} fonctionne de nouveau.${total ? ` Durée de la panne : ${total}.` : ""}`,
        conseil: null, lienVu: null, lienDetail, tag,
      };
    }
    case "lenteur":
      return {
        objet: `[LENTEUR] ${nom}`,
        titre: `Lenteur · ${e.moniteur_nom}`,
        corps: `${nom} répond lentement : ${e.dernier_ms ?? "?"} ms, au-dessus de votre seuil de ${e.seuil_lent_ms ?? "?"} ms.`,
        conseil: "la charge du serveur et les dernières mises à jour", lienVu: null, lienDetail, tag,
      };
    case "ssl": {
      const expire = e.ssl_expire_le ? new Date(e.ssl_expire_le) : null;
      const jours = expire ? Math.max(0, Math.ceil((expire.getTime() - maintenant.getTime()) / 86400000)) : null;
      const date = expire ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: FUSEAU }).format(expire) : "bientôt";
      return {
        objet: `[SSL] Le certificat de ${nom} expire ${jours !== null ? `dans ${jours} jour${jours > 1 ? "s" : ""}` : "bientôt"}`,
        titre: `Certificat SSL · ${e.moniteur_nom}`,
        corps: `Le certificat de ${nom} expire le ${date}${jours !== null ? `, dans ${jours} jour${jours > 1 ? "s" : ""}` : ""}. Sans renouvellement, vos visiteurs verront une alerte de sécurité.`,
        conseil: "le renouvellement automatique chez votre hébergeur", lienVu: null, lienDetail, tag,
      };
    }
    case "domaine": {
      const expire = e.domaine_expire_le ? new Date(e.domaine_expire_le) : null;
      const jours = expire ? Math.max(0, Math.ceil((expire.getTime() - maintenant.getTime()) / 86400000)) : null;
      const date = expire ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: FUSEAU }).format(expire) : "bientôt";
      const quand = jours !== null ? `dans ${jours} jour${jours > 1 ? "s" : ""}` : "bientôt";
      const domaine = e.domaine ?? e.moniteur_nom;
      return {
        objet: `[DOMAINE] ${domaine} expire ${quand}`,
        titre: `Nom de domaine · ${domaine}`,
        corps: `Le nom de domaine ${domaine} expire le ${date}, ${quand}. Sans renouvellement, ${nom} deviendra injoignable et les emails sur ce domaine ne seront plus reçus.`,
        conseil: "le renouvellement et le moyen de paiement enregistré chez votre registraire", lienVu: null, lienDetail, tag,
      };
    }
  }
}

/** Plusieurs pannes du même contact sur le même canal dans la même fournée : un seul message. */
export function regrouper(envois: Envoi[]): Envoi[][] {
  const groupes = new Map<string, Envoi[]>();
  const seuls: Envoi[][] = [];
  for (const e of envois) {
    // Les intégrations reçoivent un message par incident : un webhook doit rester exploitable par une machine.
    if (e.type !== "panne" || !e.contact_id) { seuls.push([e]); continue; }
    const cle = `${e.contact_id}|${e.canal}`;
    groupes.set(cle, [...(groupes.get(cle) ?? []), e]);
  }
  return [...groupes.values(), ...seuls];
}

export function composerGroupe(groupe: Envoi[], appUrl: string, maintenant = new Date()): Message {
  if (groupe.length === 1) return composer(groupe[0], appUrl, maintenant);
  const clients = [...new Set(groupe.map((e) => e.client_nom).filter(Boolean))];
  const qui = clients.length === 1 ? ` de ${clients[0]}` : "";
  const jetons = groupe.map((e) => e.jeton).filter((j): j is string => Boolean(j)).slice(0, 10);
  return {
    objet: `[PANNE] ${groupe.length} services${qui} en panne`,
    titre: `${groupe.length} services${qui} en panne`,
    corps: `${groupe.map((e) => e.moniteur_nom).join(", ")} ne répondent plus. Une seule alerte pour ces pannes simultanées.`,
    conseil: "l'hébergeur commun à ces services",
    lienVu: jetons.length ? `${appUrl}/vu/${jetons.join(".")}` : null,
    lienDetail: `${appUrl}/tableau-de-bord`,
    tag: `groupe-${groupe[0].contact_id}`,
  };
}

/**
 * En-tête de signature d'un webhook (même principe que Stripe) :
 * « t=<horodatage>,v1=<HMAC-SHA256 hex de "t.corps"> ». Le destinataire recalcule
 * le HMAC avec son secret et refuse un horodatage de plus de 5 minutes (rejeu).
 */
export function signatureWebhook(secret: string, corps: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${corps}`).digest("hex")}`;
}

/** Corps JSON d'un webhook : stable et documenté, pour être lu par une machine. */
export function corpsWebhook(e: Envoi, appUrl: string, maintenant = new Date()): string {
  return JSON.stringify({
    evenement: e.type,
    le: maintenant.toISOString(),
    moniteur: { id: e.moniteur_id, nom: e.moniteur_nom, url: e.moniteur_url, client: e.client_nom },
    incident: e.incident_id ? { id: e.incident_id, debut: e.debut, fin: e.fin, cause: e.cause, lieux: e.lieux?.split(",") ?? [], lien: `${appUrl}/incidents/${e.incident_id}` } : null,
    message: composer(e, appUrl, maintenant).corps,
  });
}

/** Texte d'un message Telegram : court, sans mise en forme à échapper. */
export function texteTelegram(e: Envoi, appUrl: string, maintenant = new Date()): string {
  const m = composer(e, appUrl, maintenant);
  const icone = { panne: "🔴", rappel: "🔴", escalade: "🔴", retabli: "🟢", lenteur: "🟠", ssl: "🟠", domaine: "🟠" }[e.type];
  return `${icone} ${m.titre}\n${m.corps}${m.conseil ? `\nÀ vérifier : ${m.conseil}` : ""}\n${m.lienDetail}`;
}

export function echapper(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function emailHtml(m: Message, appUrl: string): string {
  const bouton = (href: string, texte: string, plein: boolean) =>
    `<a href="${echapper(href)}" style="display:inline-block;padding:12px 20px;border-radius:8px;font-weight:600;text-decoration:none;${plein ? "background:#0E7A50;color:#ffffff" : "border:1px solid #C9D1DD;color:#0F172A"}">${echapper(texte)}</a>`;
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#EEF1F5;font-family:Arial,sans-serif;color:#0F172A">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#ffffff;border-radius:12px;padding:28px">
<p style="margin:0 0 16px;font-weight:700">AlerteRobot</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${echapper(m.titre)}</h1>
<p style="margin:0 0 16px;line-height:1.55">${echapper(m.corps)}</p>
${m.conseil ? `<p style="margin:0 0 20px;padding:12px 14px;background:#F4F6FA;border-radius:8px;line-height:1.5"><strong>À vérifier en premier :</strong> ${echapper(m.conseil)}</p>` : ""}
<p style="margin:0">${m.lienVu ? bouton(m.lienVu, "J'ai vu, j'arrête les rappels", true) + "&nbsp; " : ""}${bouton(m.lienDetail, "Voir le détail", !m.lienVu)}</p>
</div>
<p style="margin:16px 8px 0;font-size:12px;color:#4A5468;line-height:1.6">Vous recevez cet email parce que vous êtes contact d'un moniteur AlerteRobot. <a href="${echapper(appUrl)}/alertes" style="color:#0E6B47">Gérer mes alertes</a><br>AlerteRobot ne vous demandera jamais votre mot de passe ni un code reçu par SMS.</p>
</div></body></html>`;
}

export function emailTexte(m: Message): string {
  return [m.titre, "", m.corps, m.conseil ? `\nÀ vérifier en premier : ${m.conseil}` : "", "",
    m.lienVu ? `J'ai vu (arrête les rappels) : ${m.lienVu}` : "", `Détail : ${m.lienDetail}`].filter((l) => l !== null).join("\n");
}
