import "server-only";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Adresse IP du visiteur, telle que transmise par l'hébergeur (première valeur de x-forwarded-for). */
export async function ipVisiteur(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "inconnue").trim().slice(0, 64);
}

/**
 * true si l'appel reste sous la limite. En cas de panne de la base, on refuse
 * (fail closed) : mieux vaut un « réessayez » qu'une porte ouverte au brute force.
 */
export async function sousLimite(cle: string, max: number, fenetreS: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc("limiter", { p_cle: cle, p_max: max, p_fenetre_s: fenetreS });
  return !error && data === true;
}
