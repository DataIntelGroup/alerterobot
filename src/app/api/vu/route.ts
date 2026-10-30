import { NextResponse, type NextRequest } from "next/server";
import { confirmerVu, lireJetons } from "@/lib/vu";

/**
 * Bouton « J'ai vu » d'une notification push, appelé par le service worker.
 * Le jeton est le seul justificatif (pas de cookie) ; seule notre origine est acceptée.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return new NextResponse(null, { status: 403 });
  const corps = (await req.json().catch(() => null)) as { jetons?: unknown } | null;
  const jetons = typeof corps?.jetons === "string" ? lireJetons(corps.jetons) : null;
  if (!jetons) return NextResponse.json({ statut: "invalide" }, { status: 400 });
  const r = await confirmerVu(jetons);
  return NextResponse.json(r, { status: r.statut === "limite" ? 429 : 200, headers: { "cache-control": "no-store" } });
}
