import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export type Organisation = { id: string; nom: string; forfait: string; moniteurs_max: number; role: string };

/** Utilisateur vérifié auprès de Supabase (getUser, jamais getSession seul côté serveur). */
export const utilisateur = cache(async () => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

/** Garde de chaque page de l'espace connecté : utilisateur + organisation, sinon redirection. */
export const espace = cache(async () => {
  const user = await utilisateur();
  if (!user) redirect("/connexion");
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("membres")
    .select("role, organisations (id, nom, forfait, moniteurs_max)")
    .eq("user_id", user.id)
    .order("cree_le")
    .limit(1)
    .maybeSingle();
  const org = data?.organisations as unknown as Omit<Organisation, "role"> | null;
  if (!data || !org) redirect("/organisation/nouvelle");
  return { user, supabase, org: { ...org, role: data.role as string } satisfies Organisation };
});

export const peutEcrire = (role: string) => role !== "lecteur";
