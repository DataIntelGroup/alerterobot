"use server";

import { confirmerVu, lireJetons, type ResultatVu } from "@/lib/vu";

export async function confirmer(_: ResultatVu | undefined, form: FormData): Promise<ResultatVu> {
  const jetons = lireJetons(String(form.get("jetons") ?? ""));
  if (!jetons) return { statut: "invalide", moniteurs: [] };
  return confirmerVu(jetons);
}
