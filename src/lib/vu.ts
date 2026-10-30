import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ipVisiteur, sousLimite } from "@/lib/securite/limite";

export type ResultatVu = { statut: "ok" | "deja" | "invalide" | "limite"; moniteurs: string[] };

const JETON = /^[0-9a-f]{48}$/;

/** Un lien d'alerte groupée porte jusqu'à 10 jetons séparés par des points. */
export function lireJetons(brut: string): string[] | null {
  const jetons = brut.split(".");
  return jetons.length >= 1 && jetons.length <= 10 && jetons.every((j) => JETON.test(j)) ? jetons : null;
}

export async function confirmerVu(jetons: string[]): Promise<ResultatVu> {
  if (!(await sousLimite(`vu:ip:${await ipVisiteur()}`, 30, 600))) return { statut: "limite", moniteurs: [] };
  const admin = supabaseAdmin();
  const resultats = await Promise.all(jetons.map((j) => admin.rpc("confirmer_vu", { p_jeton: j }).single<{ resultat: string; moniteur_nom: string | null }>()));
  const valides = resultats.map((r) => r.data).filter((d): d is { resultat: string; moniteur_nom: string | null } => Boolean(d) && d!.resultat !== "invalide");
  if (!valides.length) return { statut: "invalide", moniteurs: [] };
  return {
    statut: valides.some((v) => v.resultat === "ok") ? "ok" : "deja",
    moniteurs: valides.map((v) => v.moniteur_nom).filter((n): n is string => Boolean(n)),
  };
}
