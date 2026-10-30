import { isIP } from "node:net";

/**
 * Expiration d'un nom de domaine, lue dans le registre public par RDAP (le successeur de whois).
 * rdap.org redirige vers le registre du TLD (Verisign, AFNIC, NIC.CI…) ; un TLD sans RDAP
 * renvoie simplement null : on n'alerte alors pas, on ne devine jamais une date.
 */

// Deuxièmes niveaux courants sous un TLD pays (boutique.co.ci, ecole.ac.ci, mairie.gouv.ci…).
const DEUXIEME_NIVEAU = new Set(["co", "com", "or", "org", "ac", "edu", "gouv", "gov", "go", "ne", "net", "nom", "int", "presse", "aeroport", "asso"]);

/** « api.boutique.co.ci » → « boutique.co.ci » ; « www.exemple.com » → « exemple.com ». */
export function domaineEnregistrable(hote: string): string | null {
  const h = hote.toLowerCase().replace(/\.$/, "");
  if (!h || isIP(h.replace(/^\[|\]$/g, ""))) return null;
  const parties = h.split(".");
  if (parties.length < 2) return null;
  const tld = parties.at(-1)!;
  const avant = parties.at(-2)!;
  const nb = tld.length === 2 && DEUXIEME_NIVEAU.has(avant) && parties.length >= 3 ? 3 : 2;
  return parties.slice(-nb).join(".");
}

type Rdap = { events?: { eventAction?: string; eventDate?: string }[] };

export function expirationRdap(json: unknown): Date | null {
  const evenement = (json as Rdap)?.events?.find((e) => e.eventAction === "expiration");
  if (!evenement?.eventDate) return null;
  const d = new Date(evenement.eventDate);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function lireExpiration(domaine: string): Promise<Date | null> {
  try {
    const rep = await fetch(`https://rdap.org/domain/${encodeURIComponent(domaine)}`, {
      headers: { accept: "application/rdap+json, application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!rep.ok) return null;
    const texte = await rep.text();
    if (texte.length > 500_000) return null;
    return expirationRdap(JSON.parse(texte));
  } catch {
    return null;
  }
}
