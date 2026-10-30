import { createClient } from "@supabase/supabase-js";
import { DB_SCHEMA } from "../src/lib/supabase/schema.ts";

/** Client service_role des workers. La clé ne quitte jamais le serveur qui les héberge. */
export function base() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");
  return createClient(url, cle, { db: { schema: DB_SCHEMA }, auth: { persistSession: false, autoRefreshToken: false } });
}

export const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function journal(niveau: "info" | "erreur", message: string, details: Record<string, unknown> = {}) {
  // Une ligne JSON par évènement, sans jeton ni clé : lisible par n'importe quel collecteur de logs.
  console[niveau === "erreur" ? "error" : "log"](JSON.stringify({ t: new Date().toISOString(), niveau, message, ...details }));
}

/** Arrêt propre sur SIGTERM/SIGINT : la boucle finit son tour en cours. */
export function arretDemande(): () => boolean {
  let arret = false;
  for (const s of ["SIGTERM", "SIGINT"] as const) process.on(s, () => { arret = true; });
  return () => arret;
}
