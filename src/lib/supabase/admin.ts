import "server-only";
import { createClient } from "@supabase/supabase-js";
import { DB_SCHEMA } from "./schema";

/**
 * Client service_role : contourne la RLS. Réservé aux trois usages sans session :
 * page de statut publique, heartbeat et « J'ai vu » par jeton, limiteur de débit.
 * Jamais pour lire ou écrire les données d'un utilisateur connecté.
 */
export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
