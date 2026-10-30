import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { VueStatut, type Statut } from "@/components/VueStatut";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

// Seule source de la page : statut_public, qui ne renvoie ni URL, ni cause technique, ni contact.
const charger = cache(async (slug: string): Promise<Statut | null> => {
  if (!SLUG.test(slug)) return null;
  const { data } = await supabaseAdmin().rpc("statut_public", { p_slug: slug });
  return (data as Statut | null) ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await charger((await params).slug);
  return { title: s ? `${s.nom} — État des services` : "État des services" };
}

export default async function PageStatut({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await charger(slug);
  if (!s) notFound();
  return <VueStatut s={s} slug={slug} />;
}
