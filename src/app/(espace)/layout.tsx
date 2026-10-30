import { espace } from "@/lib/session";
import { Coque } from "@/components/espace/Coque";
import { deconnexion } from "../(auth)/actions";

export default async function EspaceLayout({ children }: { children: React.ReactNode }) {
  const { org, supabase, user } = await espace();
  const [{ count: moniteurs }, { count: incidents }] = await Promise.all([
    supabase.from("moniteurs").select("id", { count: "exact", head: true }).eq("org_id", org.id),
    supabase.from("incidents").select("id", { count: "exact", head: true }).eq("org_id", org.id).is("fin", null),
  ]);
  return (
    <Coque orgNom={org.nom} forfait={org.forfait} moniteurs={moniteurs ?? 0} moniteursMax={org.moniteurs_max}
      email={user.email ?? ""} incidents={incidents ?? 0} deconnexion={deconnexion}>
      {children}
    </Coque>
  );
}
