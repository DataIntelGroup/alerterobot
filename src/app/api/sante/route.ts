import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * État de la configuration, pour diagnostiquer un déploiement : dit quelles variables
 * sont présentes (oui/non, jamais leur valeur) et si la base répond.
 */
const VARIABLES = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "APP_URL",
  "ALERTEROBOT_SECRET_LIENS", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "RESEND_API_KEY", "EMAIL_FROM",
  "ALERTEROBOT_ADMIN_EMAILS", "TELEGRAM_BOT_NOM",
] as const;

export async function GET() {
  const presentes = Object.fromEntries(VARIABLES.map((v) => [v, Boolean(process.env[v])]));
  let base: "ok" | "injoignable" | "non configurée" = "non configurée";
  if (presentes.NEXT_PUBLIC_SUPABASE_URL && presentes.SUPABASE_SERVICE_ROLE_KEY) {
    const { error } = await supabaseAdmin().rpc("statut_public", { p_slug: "sante" }).then((r) => r, () => ({ error: true }));
    base = error ? "injoignable" : "ok";
  }
  return NextResponse.json({ base, variables: presentes }, { headers: { "cache-control": "no-store" } });
}
