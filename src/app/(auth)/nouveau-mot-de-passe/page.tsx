import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { utilisateur } from "@/lib/session";
import { FormulaireNouveau } from "./FormulaireNouveau";

export const metadata: Metadata = { title: "Nouveau mot de passe", robots: { index: false, follow: false } };

export default async function NouveauMotDePasse() {
  // On n'arrive ici qu'avec la session ouverte par le lien de l'email.
  if (!(await utilisateur())) redirect("/connexion?lien=expire");
  return (
    <main className="centre">
      <div className="boite pile">
        <Logo />
        <div>
          <h1>Choisissez un nouveau mot de passe</h1>
          <p className="doux">12 caractères au moins. Une petite phrase est plus sûre et plus facile à retenir.</p>
        </div>
        <FormulaireNouveau />
      </div>
    </main>
  );
}
