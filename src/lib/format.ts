const FUSEAU = "Africa/Abidjan";

export function heure(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: FUSEAU }).format(new Date(iso));
}

export function dateCourte(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: FUSEAU }).format(new Date(iso));
}

export function duree(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${String(min % 60).padStart(2, "0")}` : `${h} h`;
}

/** « à l'instant », « il y a 3 min », « il y a 2 h », puis la date. */
export function ilYA(iso: string, maintenant = Date.now()): string {
  const s = Math.max(0, (maintenant - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `le ${dateCourte(iso)}`;
}

/** « Bonjour » ou « Bonsoir » selon l'heure d'Abidjan. */
export function salutation(maintenant = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: FUSEAU }).format(maintenant));
  return h >= 18 || h < 4 ? "Bonsoir" : "Bonjour";
}

export function pourcentage(v: number): string {
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
}

export const ETATS: Record<string, string> = {
  inconnu: "En attente", ok: "En ligne", lent: "Lent", suspect: "Vérification…", panne: "En panne",
};

export const TYPES: Record<string, string> = {
  http: "Site web", mot_cle: "Mot-clé", api: "API", paiement: "Mobile money", heartbeat: "Heartbeat",
};
