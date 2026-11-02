import type { DonneesVue } from "@/components/espace/VueEnsemble";
import type { Interruption, MoniteurTuile, Point } from "@/components/espace/VueServices";

// Données de démonstration du scénario des maquettes, pour les pages d'aperçu servies en développement
// uniquement : en production elles répondent 404 et ne lisent aucune donnée réelle.
export function demo(maintenant: number, vide: boolean): DonneesVue & { courbe: Point[]; moniteurs: MoniteurTuile[]; interruptions: Interruption[] } {
  const il = (min: number) => new Date(maintenant - min * 60000).toISOString();
  const dans = (jours: number) => new Date(maintenant + jours * 86400000).toISOString();
  const moniteurs: MoniteurTuile[] = vide ? [] : [
    { id: "m1", nom: "Paiement mobile money", type: "paiement", url: "paiement.boutique-exemple.ci", etat: "panne", etat_depuis: il(12), derniere_verif: il(0.3), dernier_ms: null, seuil_lent_ms: 1500, ssl_expire_le: null, dernier_signal: null, client: "Boutique Exemple", cree_le: il(60 * 24 * 75) },
    { id: "m2", nom: "Site web", type: "http", url: "boutique-exemple.ci", etat: "ok", etat_depuis: il(2000), derniere_verif: il(0.4), dernier_ms: 318, seuil_lent_ms: 2000, ssl_expire_le: null, dernier_signal: null, client: "Boutique Exemple", cree_le: il(60 * 24 * 75) },
    { id: "m3", nom: "API des cours", type: "api", url: "api.ecole-exemple.ci/v1/cours", etat: "lent", etat_depuis: il(42), derniere_verif: il(1), dernier_ms: 2800, seuil_lent_ms: 1500, ssl_expire_le: null, dernier_signal: null, client: "École Exemple", cree_le: il(60 * 24 * 75) },
    { id: "m4", nom: "Clinique", type: "http", url: "clinique-exemple.ci", etat: "ok", etat_depuis: il(9000), derniere_verif: il(2), dernier_ms: 204, seuil_lent_ms: 2000, ssl_expire_le: dans(7), dernier_signal: null, client: "Clinique Exemple", cree_le: il(60 * 24 * 75) },
    { id: "m5", nom: "Sauvegarde nocturne", type: "heartbeat", url: null, etat: "ok", etat_depuis: il(3000), derniere_verif: il(680), dernier_ms: null, seuil_lent_ms: 2000, ssl_expire_le: null, dernier_signal: il(680), client: "Immobilier Exemple", cree_le: il(60 * 24 * 75) },
  ];
  const courbe: Point[] = vide ? [] : Array.from({ length: 24 }, (_, i) => {
    const heure = new Date(Math.floor(maintenant / 3600000) * 3600000 - (23 - i) * 3600000).toISOString();
    const base = 330 + Math.round(90 * Math.sin(i / 3)) + (i === 22 ? 260 : 0);
    return [{ heure, lieu: "abidjan", ms: base }, { heure, lieu: "paris", ms: Math.round(base * 1.3) }];
  }).flat();
  return {
    orgNom: "Agence Exemple",
    ecriture: true,
    maintenant,
    rappelMin: 15,
    pushActif: !vide,
    moniteurs,
    incidents: vide ? [] : [
      { id: "i1", moniteur_id: "m1", debut: il(12), confirme_le: il(10), fin: null, cause: "Délai dépassé", lieux: "abidjan,paris", vu_le: null, vu_par: null, derniere_relance: il(10) },
      { id: "i2", moniteur_id: "m2", debut: il(60 * 26), confirme_le: il(60 * 26 - 2), fin: il(60 * 26 - 23), cause: "Erreur 502", lieux: "abidjan,paris", vu_le: il(60 * 26 - 5), vu_par: "Awa", derniere_relance: null },
    ],
    alertes: vide ? [] : [
      { id: "a1", type: "panne", canal: "push", statut: "envoyee", cree_le: il(10), envoye_le: il(10), moniteur: "Paiement mobile money", moniteur_type: "paiement" },
      { id: "a2", type: "lenteur", canal: "email", statut: "envoyee", cree_le: il(42), envoye_le: il(42), moniteur: "API des cours", moniteur_type: "api" },
      { id: "a3", type: "ssl", canal: "push", statut: "envoyee", cree_le: il(300), envoye_le: il(300), moniteur: "Clinique", moniteur_type: "http" },
      { id: "a4", type: "retabli", canal: "email", statut: "envoyee", cree_le: il(60 * 26 - 23), envoye_le: il(60 * 26 - 23), moniteur: "Site web", moniteur_type: "http" },
    ],
    courbe,
    interruptions: vide ? [] : [
      { moniteur_id: "m1", debut: il(12), fin: null },
      { moniteur_id: "m2", debut: il(60 * 26), fin: il(60 * 26 - 23) },
      { moniteur_id: "m1", debut: il(60 * 24 * 9), fin: il(60 * 24 * 9 - 95) },
      { moniteur_id: "m3", debut: il(60 * 24 * 21), fin: il(60 * 24 * 21 - 12) },
      { moniteur_id: "m4", debut: il(60 * 24 * 44), fin: il(60 * 24 * 44 - 7) },
    ],
  };
}
