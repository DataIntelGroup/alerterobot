import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { lireJetons } from "@/lib/vu";
import { BoutonVu } from "./BoutonVu";

export const metadata: Metadata = { title: "J'ai vu", robots: { index: false, follow: false } };

/**
 * Le lien de l'email ouvre cette page, qui demande un clic. Confirmer dès
 * l'ouverture (GET) laisserait les antivirus de messagerie, qui ouvrent les
 * liens pour les analyser, arrêter les rappels à la place de la personne.
 */
export default async function PageVu({ params }: { params: Promise<{ jetons: string }> }) {
  const { jetons } = await params;
  if (!lireJetons(jetons)) notFound();
  return (
    <main className="centre">
      <div className="boite pile">
        <Logo />
        <div>
          <h1>Vous vous en occupez ?</h1>
          <p className="doux">En confirmant, les rappels s&apos;arrêtent et le contact suivant ne sera pas dérangé. Vous recevrez quand même un message dès que le service sera rétabli.</p>
        </div>
        <BoutonVu jetons={jetons} />
      </div>
    </main>
  );
}
