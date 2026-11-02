import type { Metadata } from "next";
import { espace, peutEcrire } from "@/lib/session";
import { FILTRES, VueServices, type Filtre, type Interruption, type MoniteurTuile, type Point } from "@/components/espace/VueServices";

export const metadata: Metadata = { title: "Mes services" };

export default async function MesServices({ searchParams }: { searchParams: Promise<{ voir?: string }> }) {
  const { voir } = await searchParams;
  const filtre: Filtre = voir && voir in FILTRES ? (voir as Filtre) : "tous";
  const { supabase, org } = await espace();
  const depuis = new Date(Date.now() - 60 * 86400000).toISOString();
  const [moniteurs, interruptions, courbe] = await Promise.all([
    supabase.from("moniteurs")
      .select("id, nom, type, url, actif, etat, etat_depuis, derniere_verif, dernier_ms, seuil_lent_ms, ssl_expire_le, domaine, domaine_expire_le, dernier_signal, cree_le, clients (nom)")
      .eq("org_id", org.id).order("nom"),
    supabase.from("incidents")
      .select("moniteur_id, debut, fin")
      .eq("org_id", org.id).eq("en_maintenance", false)
      .or(`fin.is.null,fin.gte."${depuis}"`).order("debut", { ascending: false }).limit(1000),
    supabase.rpc("temps_reponse_24h", { p_org: org.id }),
  ]);

  return (
    <VueServices
      d={{
        orgNom: org.nom,
        ecriture: peutEcrire(org.role),
        maintenant: Date.now(),
        filtre,
        moniteurs: (moniteurs.data ?? []).map((m) => ({ ...m, client: (m.clients as unknown as { nom: string } | null)?.nom ?? null })) as MoniteurTuile[],
        interruptions: (interruptions.data ?? []) as Interruption[],
        courbe: (courbe.data ?? []) as Point[],
      }}
    />
  );
}
