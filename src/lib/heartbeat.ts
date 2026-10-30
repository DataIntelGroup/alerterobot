import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ipVisiteur, sousLimite } from "@/lib/securite/limite";

const JETON = /^[0-9a-f]{48}$/;
const MESSAGE_MAX = 2000;

/**
 * Signal d'une tâche de fond : « start », « ok » ou « fail ».
 * Réponse identique pour un jeton inconnu ou mal formé : aucun indice à qui teste des jetons.
 */
export async function signalHeartbeat(req: Request, jeton: string, signal: "start" | "ok" | "fail"): Promise<NextResponse> {
  const entetes = { "cache-control": "no-store" };
  if (!JETON.test(jeton)) return new NextResponse("inconnu\n", { status: 404, headers: entetes });
  const [parJeton, parIp] = await Promise.all([
    // Clé dérivée du jeton : le jeton lui-même n'est jamais écrit en base.
    sousLimite(`heartbeat:${createHash("sha256").update(jeton).digest("hex").slice(0, 32)}`, 30, 60),
    sousLimite(`heartbeat:ip:${await ipVisiteur()}`, 600, 60),
  ]);
  if (!parJeton || !parIp) return new NextResponse("trop de signaux\n", { status: 429, headers: entetes });

  // Sur un échec, le corps de la requête (journal de la tâche) devient le message de l'incident.
  let message: string | null = null;
  if (signal === "fail" && req.method === "POST") {
    const texte = await req.text().catch(() => "");
    message = texte.slice(0, MESSAGE_MAX) || null;
  }
  const { data } = await supabaseAdmin().rpc("ping_heartbeat", { p_jeton: jeton, p_signal: signal, p_message: message });
  return data === true
    ? new NextResponse("ok\n", { status: 200, headers: entetes })
    : new NextResponse("inconnu\n", { status: 404, headers: entetes });
}
