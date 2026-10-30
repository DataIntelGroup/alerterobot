import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { inscription } from "../actions";
import { FormulaireAuth } from "../FormulaireAuth";
import { CoteAuth } from "../CoteAuth";

export const metadata: Metadata = { title: "Créer un compte" };

export default function PageInscription() {
  return (
    <div className="auth">
      <main className="auth-form">
        <div><Link href="/" aria-label="Retour à l'accueil"><Logo /></Link></div>
        <div>
          <h1>Surveillez votre premier site gratuitement</h1>
          <p className="doux">Un compte, une adresse à coller, et AlerteRobot veille. Aucune carte bancaire demandée.</p>
        </div>
        <div><FormulaireAuth action={inscription} bouton="Créer mon compte" inscription /></div>
        <div><p className="pale">Déjà un compte ? <Link href="/connexion">Se connecter</Link></p></div>
      </main>
      <CoteAuth titre="Sachez que votre site est en panne avant vos clients." />
    </div>
  );
}
