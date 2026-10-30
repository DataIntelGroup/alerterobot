import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { connexion } from "../actions";
import { FormulaireAuth } from "../FormulaireAuth";
import { CoteAuth } from "../CoteAuth";

export const metadata: Metadata = { title: "Connexion" };

export default async function PageConnexion({ searchParams }: { searchParams: Promise<{ lien?: string }> }) {
  const { lien } = await searchParams;
  return (
    <div className="auth">
      <main className="auth-form">
        <div><Link href="/" aria-label="Retour à l'accueil"><Logo /></Link></div>
        <div>
          <h1>Bon retour parmi nous</h1>
          <p className="doux">Connectez-vous pour voir l&apos;état de vos sites et vos dernières alertes.</p>
        </div>
        {lien === "expire" && (
          <div><p role="status" className="alerte info">Ce lien a expiré ou a déjà servi. Connectez-vous, ou demandez un nouveau lien avec « Mot de passe oublié ».</p></div>
        )}
        <div><FormulaireAuth action={connexion} bouton="Se connecter" /></div>
        <div><p className="pale">Pas encore de compte ? <Link href="/inscription">Créer un compte gratuit</Link></p></div>
      </main>
      <CoteAuth titre="Vos sites surveillés pendant que vous dormez." />
    </div>
  );
}
