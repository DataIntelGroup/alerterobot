import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { utilisateur } from "@/lib/session";

/**
 * Garde de la console d'administration. Pour un visiteur qui n'est pas
 * administrateur, la console n'existe pas (404) : on ne révèle pas son adresse.
 * Conditions : session vérifiée par Supabase, email confirmé, et présent dans
 * ALERTEROBOT_ADMIN_EMAILS (liste séparée par des virgules).
 */
export const gardeAdmin = cache(async () => {
  const user = await utilisateur();
  const admins = (process.env.ALERTEROBOT_ADMIN_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const email = user?.email?.toLowerCase();
  if (!user || !email || !user.email_confirmed_at || !admins.includes(email)) notFound();
  return user;
});
