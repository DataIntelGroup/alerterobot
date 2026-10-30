import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { motDePasseOublie } from "../actions";
import { FormulaireEmail } from "./FormulaireEmail";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function MotDePasseOublie() {
  return (
    <main className="centre">
      <div className="boite pile">
        <Link href="/" aria-label="Retour à l'accueil"><Logo /></Link>
        <div>
          <h1>Mot de passe oublié ?</h1>
          <p className="doux">Indiquez votre adresse : nous vous envoyons un lien pour en choisir un nouveau. Vos moniteurs continuent d&apos;être surveillés pendant ce temps.</p>
        </div>
        <FormulaireEmail action={motDePasseOublie} />
        <p className="pale"><Link href="/connexion">Retour à la connexion</Link></p>
      </div>
    </main>
  );
}
