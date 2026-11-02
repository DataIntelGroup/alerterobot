import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Coque } from "@/components/espace/Coque";
import { VueEnsemble } from "@/components/espace/VueEnsemble";
import { demo } from "./demo";

export const metadata: Metadata = { title: "Aperçu", robots: { index: false, follow: false } };

export default async function Apercu({ searchParams }: { searchParams: Promise<{ etat?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const vide = (await searchParams).etat === "vide";
  const d = demo(Date.now(), vide);
  return (
    <>
      <p className="apercu-bandeau">
        Aperçu avec des données de démonstration, visible en développement seulement ·{" "}
        {vide ? <Link href="/apercu">voir un compte actif</Link> : <Link href="/apercu?etat=vide">voir un nouveau compte</Link>} ·{" "}
        <Link href="/apercu/services">voir « Mes services »</Link>
      </p>
      <Coque orgNom={d.orgNom} forfait={vide ? "decouverte" : "agence"} moniteurs={d.moniteurs.length} moniteursMax={vide ? 1 : 100}
        email="awa@agence-exemple.ci" incidents={d.incidents.filter((i) => !i.fin).length}>
        <VueEnsemble d={d} />
      </Coque>
    </>
  );
}
