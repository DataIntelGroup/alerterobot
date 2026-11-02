import type { Metadata } from "next";
import { espace, peutEcrire } from "@/lib/session";
import { VueEnsemble, type AlerteEnvoyee, type Incident, type Moniteur } from "@/components/espace/VueEnsemble";
import { accuserReception } from "../actions";

export const metadata: Metadata = { title: "Aujourd'hui" };

export default async function TableauDeBord() {
  const { supabase, org, user } = await espace();
  const depuis = new Date(Date.now() - 30 * 86400000).toISOString();
  const [moniteurs, incidents, alertes, push, reglages] = await Promise.all([
    supabase.from("moniteurs")
      .select("id, nom, type, url, actif, etat, etat_depuis, derniere_verif, dernier_ms, seuil_lent_ms, ssl_expire_le, domaine, domaine_expire_le, dernier_signal, clients (nom)")
      .eq("org_id", org.id).order("nom"),
    supabase.from("incidents")
      .select("id, moniteur_id, debut, confirme_le, fin, cause, lieux, vu_le, vu_par, derniere_relance")
      .eq("org_id", org.id).eq("en_maintenance", false)
      .or(`fin.is.null,fin.gte."${depuis}"`).order("debut", { ascending: false }).limit(200),
    supabase.from("notifications")
      .select("id, type, canal, statut, cree_le, envoye_le, moniteurs (nom, type)")
      .eq("org_id", org.id).order("cree_le", { ascending: false }).limit(14),
    supabase.from("abonnements_push").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("organisations").select("rappel_min").eq("id", org.id).single(),
  ]);

  return (
    <VueEnsemble
      actionVu={accuserReception}
      d={{
        orgNom: org.nom,
        ecriture: peutEcrire(org.role),
        maintenant: Date.now(),
        rappelMin: reglages.data?.rappel_min ?? 15,
        pushActif: (push.count ?? 0) > 0,
        moniteurs: (moniteurs.data ?? []).map((m) => ({ ...m, client: (m.clients as unknown as { nom: string } | null)?.nom ?? null })) as Moniteur[],
        incidents: (incidents.data ?? []) as Incident[],
        alertes: (alertes.data ?? []).map((a) => {
          const m = a.moniteurs as unknown as { nom: string; type: string } | null;
          return { ...a, moniteur: m?.nom ?? "", moniteur_type: m?.type };
        }) as AlerteEnvoyee[],
      }}
    />
  );
}
