import { NextResponse, type NextRequest } from "next/server";
import { signalHeartbeat } from "@/lib/heartbeat";

/**
 * /api/heartbeat/<jeton>/start : la tâche commence (mesure de la durée, détection de blocage) ;
 * /api/heartbeat/<jeton>/fail  : la tâche a échoué, alerte immédiate (corps POST = message).
 */
async function signal(req: NextRequest, { params }: { params: Promise<{ jeton: string; signal: string }> }) {
  const { jeton, signal: s } = await params;
  if (s !== "start" && s !== "fail") return new NextResponse("inconnu\n", { status: 404, headers: { "cache-control": "no-store" } });
  return signalHeartbeat(req, jeton, s);
}

export { signal as GET, signal as POST, signal as HEAD };
