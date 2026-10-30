import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { actionDesabonner } from "../actions";
import { BoutonLien } from "../BoutonLien";

export const metadata: Metadata = { title: "Se désabonner", robots: { index: false, follow: false } };

export default async function Desabonner({ searchParams }: { searchParams: Promise<{ j?: string }> }) {
  const { j } = await searchParams;
  return (
    <main className="centre">
      <div className="boite pile">
        <Logo />
        <div>
          <h1>Ne plus recevoir ces emails ?</h1>
          <p className="doux">Vous pourrez toujours consulter la page de statut quand vous le souhaitez.</p>
        </div>
        {j ? <BoutonLien jeton={j} action={actionDesabonner} bouton="Me désabonner"
          succes="C'est fait : vous ne recevrez plus d'email de {nom}." />
          : <p className="alerte erreur">Ce lien est incomplet. Ouvrez-le depuis l&apos;email reçu.</p>}
      </div>
    </main>
  );
}
