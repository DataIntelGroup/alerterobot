import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Coque } from "@/components/espace/Coque";
import { FILTRES, VueServices, type Filtre } from "@/components/espace/VueServices";
import { demo } from "../demo";

export const metadata: Metadata = { title: "Aperçu des services", robots: { index: false, follow: false } };

export default async function ApercuServices({ searchParams }: { searchParams: Promise<{ voir?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { voir } = await searchParams;
  const filtre: Filtre = voir && voir in FILTRES ? (voir as Filtre) : "tous";
  const d = demo(Date.now(), false);
  return (
    <>
      <p className="apercu-bandeau">
        Aperçu avec des données de démonstration, visible en développement seulement · <Link href="/apercu">voir « Aujourd&apos;hui »</Link>
      </p>
      <Coque orgNom={d.orgNom} forfait="agence" moniteurs={d.moniteurs.length} moniteursMax={100}
        email="awa@agence-exemple.ci" incidents={d.incidents.filter((i) => !i.fin).length}>
        <VueServices d={{ ...d, filtre }} lien={(f) => (f === "tous" ? "/apercu/services" : `/apercu/services?voir=${f}`)} />
      </Coque>
    </>
  );
}
