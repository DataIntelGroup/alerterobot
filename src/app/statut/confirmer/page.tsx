import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { actionConfirmer } from "../actions";
import { BoutonLien } from "../BoutonLien";

export const metadata: Metadata = { title: "Confirmer l'abonnement", robots: { index: false, follow: false } };

export default async function Confirmer({ searchParams }: { searchParams: Promise<{ j?: string }> }) {
  const { j } = await searchParams;
  return (
    <main className="centre">
      <div className="boite pile">
        <Logo />
        <div>
          <h1>Confirmer votre abonnement</h1>
          <p className="doux">Vous recevrez un email au début et à la fin de chaque incident, et avant chaque maintenance programmée. Rien d&apos;autre.</p>
        </div>
        {j ? <BoutonLien jeton={j} action={actionConfirmer} bouton="Je confirme"
          succes="C'est fait : vous suivez l'état des services de {nom}. Vous pouvez fermer cette page." />
          : <p className="alerte erreur">Ce lien est incomplet. Ouvrez-le depuis l&apos;email reçu.</p>}
      </div>
    </main>
  );
}
