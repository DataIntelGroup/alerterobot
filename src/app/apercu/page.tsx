import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Coque } from "@/components/espace/Coque";
import { VueEnsemble, type DonneesVue } from "@/components/espace/VueEnsemble";

export const metadata: Metadata = { title: "Aperçu", robots: { index: false, follow: false } };

// Données de démonstration du scénario des maquettes. Page servie en développement
// uniquement : en production elle répond 404 et ne lit aucune donnée réelle.
function demo(maintenant: number, vide: boolean): DonneesVue {
  const il = (min: number) => new Date(maintenant - min * 60000).toISOString();
  const dans = (jours: number) => new Date(maintenant + jours * 86400000).toISOString();
  const moniteurs: DonneesVue["moniteurs"] = vide ? [] : [
    { id: "m1", nom: "Paiement mobile money", type: "paiement", url: "paiement.boutique-exemple.ci", etat: "panne", etat_depuis: il(12), derniere_verif: il(0.3), dernier_ms: null, seuil_lent_ms: 1500, ssl_expire_le: null, dernier_signal: null, client: "Boutique Exemple" },
    { id: "m2", nom: "Site web", type: "http", url: "boutique-exemple.ci", etat: "ok", etat_depuis: il(2000), derniere_verif: il(0.4), dernier_ms: 318, seuil_lent_ms: 2000, ssl_expire_le: null, dernier_signal: null, client: "Boutique Exemple" },
    { id: "m3", nom: "API des cours", type: "api", url: "api.ecole-exemple.ci/v1/cours", etat: "lent", etat_depuis: il(42), derniere_verif: il(1), dernier_ms: 2800, seuil_lent_ms: 1500, ssl_expire_le: null, dernier_signal: null, client: "École Exemple" },
    { id: "m4", nom: "Clinique", type: "http", url: "clinique-exemple.ci", etat: "ok", etat_depuis: il(9000), derniere_verif: il(2), dernier_ms: 204, seuil_lent_ms: 2000, ssl_expire_le: dans(7), dernier_signal: null, client: "Clinique Exemple" },
    { id: "m5", nom: "Sauvegarde nocturne", type: "heartbeat", url: null, etat: "ok", etat_depuis: il(3000), derniere_verif: il(680), dernier_ms: null, seuil_lent_ms: 2000, ssl_expire_le: null, dernier_signal: il(680), client: "Immobilier Exemple" },
  ];
  const courbe = vide ? [] : Array.from({ length: 24 }, (_, i) => {
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
      { id: "a1", type: "panne", canal: "push", statut: "envoyee", cree_le: il(10), envoye_le: il(10), moniteur: "Paiement mobile money" },
      { id: "a2", type: "lenteur", canal: "email", statut: "envoyee", cree_le: il(42), envoye_le: il(42), moniteur: "API des cours" },
      { id: "a3", type: "ssl", canal: "push", statut: "envoyee", cree_le: il(300), envoye_le: il(300), moniteur: "Clinique" },
      { id: "a4", type: "retabli", canal: "email", statut: "envoyee", cree_le: il(60 * 26 - 23), envoye_le: il(60 * 26 - 23), moniteur: "Site web" },
    ],
    courbe,
  };
}

export default async function Apercu({ searchParams }: { searchParams: Promise<{ etat?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const vide = (await searchParams).etat === "vide";
  const d = demo(Date.now(), vide);
  return (
    <>
      <p className="apercu-bandeau">
        Aperçu avec des données de démonstration, visible en développement seulement ·{" "}
        {vide ? <Link href="/apercu">voir un compte actif</Link> : <Link href="/apercu?etat=vide">voir un nouveau compte</Link>}
      </p>
      <Coque orgNom={d.orgNom} forfait={vide ? "decouverte" : "agence"} moniteurs={d.moniteurs.length} moniteursMax={vide ? 1 : 100}
        email="awa@agence-exemple.ci" incidents={d.incidents.filter((i) => !i.fin).length}>
        <VueEnsemble d={d} />
      </Coque>
    </>
  );
}
