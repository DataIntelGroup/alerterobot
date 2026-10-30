import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Destinations autorisées après le lien d'un email : jamais une adresse fournie dans l'URL.
const SUITES: Record<string, string> = {
  "nouveau-mot-de-passe": "/nouveau-mot-de-passe",
};

/** Lien d'un email Supabase (confirmation d'inscription, mot de passe oublié) : échange le code PKCE contre une session. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const suite = SUITES[req.nextUrl.searchParams.get("suite") ?? ""] ?? "/organisation/nouvelle";
  if (code && code.length <= 200) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(suite, req.nextUrl.origin));
  }
  const echec = new URL("/connexion", req.nextUrl.origin);
  echec.searchParams.set("lien", "expire");
  return NextResponse.redirect(echec);
}
