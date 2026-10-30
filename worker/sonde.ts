import dns from "node:dns";
import { isIP } from "node:net";
import tls from "node:tls";
import { Agent, request } from "undici";
import { estIpPublique, verifierAdresse } from "../src/lib/securite/adresse.ts";

/**
 * Une vérification HTTP, durcie contre le SSRF :
 *  - chaque nom est résolu par `lookupSur`, qui refuse la connexion si UNE des
 *    adresses obtenues est interne (pas seulement la première : sinon un DNS
 *    malveillant alterne adresse publique et privée) ;
 *  - les redirections sont suivies à la main (3 au plus), chaque cible repasse
 *    par `verifierAdresse` puis par `lookupSur` ;
 *  - le corps est lu jusqu'à 1 Mo au plus, et la durée totale est bornée.
 * En cas d'échec, la sonde garde ce qu'elle a vu (code, extrait, durées) pour
 * que la page de l'incident dise quoi vérifier, comme Better Stack.
 */

export type Moniteur = {
  type: "http" | "mot_cle" | "api" | "paiement";
  url: string;
  mot_cle: string | null;
  champ_json: string | null;
  delai_ms: number;
};

export type Details = { ip?: string; dns_ms?: number; ttfb_ms?: number; redirections?: number; extrait?: string; type_contenu?: string };
export type Resultat = { ok: boolean; code: number | null; ms: number | null; erreur: string | null; sslExpire: Date | null; details: Details };

const CORPS_MAX = 1024 * 1024;
const EXTRAIT_MAX = 500;
const REDIRECTIONS_MAX = 3;
const AGENT_UTILISATEUR = "AlerteRobot/1.0 (+surveillance de disponibilite)";

type Adresse = { address: string; family: number };
type RappelLookup = (err: NodeJS.ErrnoException | null, address?: string | Adresse[], family?: number) => void;

export function lookupSur(hote: string, options: dns.LookupOptions, rappel: RappelLookup): void {
  dns.lookup(hote, { all: true, verbatim: true }, (err, adresses) => {
    if (err) return rappel(err);
    if (!adresses.length || adresses.some((a) => !estIpPublique(a.address))) {
      const e: NodeJS.ErrnoException = new Error("Adresse interne refusée");
      e.code = "EADRESSEINTERNE";
      return rappel(e);
    }
    if (options.all) return rappel(null, adresses);
    rappel(null, adresses[0].address, adresses[0].family);
  });
}

const agent = new Agent({
  connect: { lookup: lookupSur as never, timeout: 10_000 },
  headersTimeout: 30_000,
  bodyTimeout: 30_000,
  connections: 50,
});

async function lireCorps(corps: AsyncIterable<Buffer>): Promise<string> {
  const morceaux: Buffer[] = [];
  let taille = 0;
  for await (const m of corps) {
    taille += m.length;
    if (taille > CORPS_MAX) {
      morceaux.push(m.subarray(0, m.length - (taille - CORPS_MAX)));
      break;
    }
    morceaux.push(m);
  }
  return Buffer.concat(morceaux).toString("utf8");
}

/** Texte lisible d'une page d'erreur : balises retirées, espaces resserrés, 500 caractères au plus. */
export function extrait(corps: string): string {
  return corps
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EXTRAIT_MAX);
}

export function lireChamp(json: unknown, chemin: string): unknown {
  return chemin.split(".").reduce<unknown>((v, cle) => {
    if (v === null || typeof v !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(v, cle)) return undefined;
    return (v as Record<string, unknown>)[cle];
  }, json);
}

function messageErreur(e: unknown): string {
  const err = e as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
  const code = err?.code ?? err?.cause?.code;
  if (code === "EADRESSEINTERNE") return "Adresse interne refusée";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "Nom de domaine introuvable (DNS)";
  if (code === "ECONNREFUSED") return "Connexion refusée par le serveur";
  if (code === "ECONNRESET") return "Connexion coupée par le serveur";
  if (code?.startsWith("UND_ERR_CONNECT_TIMEOUT") || err?.name === "TimeoutError" || code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT") {
    return "Délai dépassé";
  }
  if (code?.startsWith("CERT_") || code?.includes("SELF_SIGNED") || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
    return "Certificat SSL invalide";
  }
  return "Erreur réseau";
}

/** Mesure le temps DNS et note l'adresse contactée (sans connexion : le contrôle SSRF reste dans lookupSur). */
async function mesurerDns(hote: string, details: Details): Promise<void> {
  if (isIP(hote)) { details.ip = hote; details.dns_ms = 0; return; }
  const t = performance.now();
  try {
    const [premiere] = await dns.promises.lookup(hote, { all: true, verbatim: true });
    details.dns_ms = Math.round(performance.now() - t);
    if (premiere && estIpPublique(premiere.address)) details.ip = premiere.address;
  } catch { details.dns_ms = Math.round(performance.now() - t); }
}

export async function verifier(m: Moniteur): Promise<Resultat> {
  const debut = performance.now();
  const signal = AbortSignal.timeout(m.delai_ms);
  const details: Details = {};
  const echec = (code: number | null, ms: number | null, erreur: string, corps?: string): Resultat =>
    ({ ok: false, code, ms, erreur, sslExpire: null, details: corps ? { ...details, extrait: extrait(corps) } : details });
  let url = m.url;
  try {
    for (let saut = 0; ; saut++) {
      const controle = verifierAdresse(url);
      if (!controle.ok) return echec(null, null, controle.raison.replace(/\.$/, ""));
      if (saut === 0) await mesurerDns(controle.url.hostname.replace(/^\[|\]$/g, ""), details);
      const rep = await request(controle.url, {
        method: "GET",
        dispatcher: agent,
        signal,
        headers: { "user-agent": AGENT_UTILISATEUR, accept: m.type === "api" ? "application/json" : "*/*" },
      });
      details.ttfb_ms = Math.round(performance.now() - debut);
      if (rep.statusCode >= 300 && rep.statusCode < 400 && rep.headers.location) {
        await rep.body.dump();
        details.redirections = saut + 1;
        if (saut >= REDIRECTIONS_MAX) return echec(rep.statusCode, null, "Trop de redirections");
        url = new URL(String(rep.headers.location), controle.url).href;
        continue;
      }
      const typeContenu = String(rep.headers["content-type"] ?? "").slice(0, 80);
      if (typeContenu) details.type_contenu = typeContenu;
      const besoinCorps = rep.statusCode >= 400 || Boolean(m.mot_cle) || (m.type === "api" && Boolean(m.champ_json));
      const corps = besoinCorps ? await lireCorps(rep.body) : (await rep.body.dump(), "");
      const ms = Math.round(performance.now() - debut);
      if (rep.statusCode >= 400) return echec(rep.statusCode, ms, `Erreur ${rep.statusCode}`, corps);
      if (m.mot_cle && !corps.includes(m.mot_cle)) {
        return echec(rep.statusCode, ms, `Mot-clé « ${m.mot_cle.slice(0, 40)} » absent de la page`, corps);
      }
      if (m.type === "api" && m.champ_json) {
        let json: unknown;
        try { json = JSON.parse(corps); } catch { return echec(rep.statusCode, ms, "Réponse JSON illisible", corps); }
        const v = lireChamp(json, m.champ_json);
        if (v === undefined || v === null) return echec(rep.statusCode, ms, `Champ JSON « ${m.champ_json} » manquant`, corps);
      }
      return { ok: true, code: rep.statusCode, ms, erreur: null, sslExpire: null, details };
    }
  } catch (e) {
    return echec(null, null, messageErreur(e));
  }
}

/**
 * POST vers une adresse fournie par un client (webhook), avec les mêmes garde-fous que les
 * vérifications : adresse contrôlée, IP résolues publiques, aucune redirection suivie, 10 s au plus.
 */
export async function posterSur(urlTexte: string, corps: string, entetes: Record<string, string>): Promise<number> {
  const controle = verifierAdresse(urlTexte);
  if (!controle.ok || controle.url.protocol !== "https:") throw new Error("Adresse de webhook refusée");
  const rep = await request(controle.url, {
    method: "POST",
    dispatcher: agent,
    body: corps,
    headers: { "content-type": "application/json", "user-agent": AGENT_UTILISATEUR, ...entetes },
    signal: AbortSignal.timeout(10_000),
  });
  await rep.body.dump();
  return rep.statusCode;
}

/** Date d'expiration du certificat, lue par une connexion TLS vers une adresse déjà contrôlée. */
export function expirationCertificat(urlTexte: string): Promise<Date | null> {
  const controle = verifierAdresse(urlTexte);
  if (!controle.ok || controle.url.protocol !== "https:") return Promise.resolve(null);
  const hote = controle.url.hostname.replace(/^\[|\]$/g, "");
  const port = Number(controle.url.port || 443);
  return new Promise((resolve) => {
    lookupSur(hote, {}, (err, adresse) => {
      if (err || typeof adresse !== "string") return resolve(null);
      const socket = tls.connect({ host: adresse, port, servername: hote, timeout: 10_000 }, () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        resolve(cert?.valid_to ? new Date(cert.valid_to) : null);
      });
      socket.on("error", () => resolve(null));
      socket.on("timeout", () => { socket.destroy(); resolve(null); });
    });
  });
}
