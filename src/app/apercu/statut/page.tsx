import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VueStatut, type Statut } from "@/components/VueStatut";

export const metadata: Metadata = { title: "Aperçu · statut", robots: { index: false, follow: false } };

// Démonstration de la page de statut publique (développement uniquement).
export default function ApercuStatut() {
  if (process.env.NODE_ENV === "production") notFound();
  const aujourdhui = new Date();
  const jours = (pannes: Record<number, number>, maintenance: number[] = []) => Array.from({ length: 90 }, (_, i) => {
    const d = new Date(aujourdhui); d.setDate(d.getDate() - (89 - i));
    return { jour: d.toISOString().slice(0, 10), pannes: pannes[i] ?? 0, maintenance: maintenance.includes(i) };
  });
  const il = (j: number, h: number, m: number) => { const d = new Date(aujourdhui); d.setDate(d.getDate() - j); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const s: Statut = {
    nom: "Boutique Exemple",
    services: [
      { nom: "Site web", etat: "ok", disponibilite: 99.98, jours: jours({ 49: 27 }, [34]) },
      { nom: "Paiement mobile money", etat: "ok", disponibilite: 99.98, jours: jours({ 89: 23 }) },
      { nom: "API des commandes", etat: "ok", disponibilite: 100, jours: jours({}) },
      { nom: "Espace client", etat: "ok", disponibilite: 100, jours: jours({}) },
    ],
    incidents: [
      { service: "Paiement mobile money", debut: il(0, 14, 0), fin: il(0, 14, 23), maj: [
        { etape: "resolu", message: "« Paiement mobile money » fonctionne de nouveau. Merci de votre patience.", le: il(0, 14, 23) },
        { etape: "identifie", message: "Notre prestataire de paiement ne répond plus. Vos commandes restent enregistrées : vous pourrez les payer dès le retour du service.", le: il(0, 14, 10) },
        { etape: "analyse", message: "Nous constatons une interruption de « Paiement mobile money ». L'équipe technique est prévenue et analyse la situation.", le: il(0, 14, 2) },
      ] },
      { service: "Site web", debut: il(40, 22, 41), fin: il(40, 23, 8) },
    ],
    maintenances: [{ debut: il(-2, 2, 0), fin: il(-2, 3, 0), motif: "Mise à jour de la boutique.", service: null }],
  };
  return (
    <>
      <p className="apercu-bandeau">Aperçu de la page de statut publique, avec des données de démonstration.</p>
      <VueStatut s={s} />
    </>
  );
}
