// Phrases sans jargon pour dire ce qui se passe : ce que vivent les clients,
// pas ce que renvoie le serveur.

/** « Vos clients ne peuvent plus payer : Paiement mobile money » selon le type de service. */
export function titrePanne(type: string, nom: string): string {
  switch (type) {
    case "paiement": return `Vos clients ne peuvent plus payer : ${nom}`;
    case "heartbeat": return `${nom} n'a pas donné signe de vie`;
    case "api": return `${nom} ne répond plus`;
    default: return `${nom} est inaccessible`;
  }
}

/** Ce que la panne a été, une fois réparée. */
export function titreResolu(type: string, nom: string): string {
  return type === "paiement" ? `Les paiements fonctionnent de nouveau : ${nom}` : `${nom} fonctionne de nouveau`;
}

export function lieuxConfirmes(lieux: string): string | null {
  if (lieux === "heartbeat") return null;
  return lieux.includes(",")
    ? "Constaté depuis Abidjan et depuis Paris : ce n'est pas un problème de votre connexion."
    : `Constaté depuis ${lieux === "paris" ? "Paris" : "Abidjan"}.`;
}

/** « 0,3 s » ou « 840 ms ». */
export function rapidite(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s` : `${ms} ms`;
}
