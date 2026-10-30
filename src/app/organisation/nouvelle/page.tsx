import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { utilisateur } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { FormulaireOrganisation } from "./FormulaireOrganisation";

export const metadata: Metadata = { title: "Votre organisation" };

export default async function NouvelleOrganisation() {
  if (!(await utilisateur())) redirect("/connexion");
  return (
    <main className="centre">
      <div className="boite pile">
        <Logo />
        <div className="etapes-onboarding" role="img" aria-label="Étape 2 sur 3"><span className="fait" /><span className="fait" /><span /></div>
        <div>
          <p className="pale">Étape 2 sur 3</p>
          <h1>Bienvenue ! Comment s&apos;appelle votre entreprise ?</h1>
          <p className="doux">C&apos;est le nom qui apparaîtra dans vos alertes et vos rapports. Une agence ajoutera ses clients juste après.</p>
        </div>
        <FormulaireOrganisation />
      </div>
    </main>
  );
}
