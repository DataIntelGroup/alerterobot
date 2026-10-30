import { NextResponse, type NextRequest } from "next/server";
import { desabonner } from "@/app/statut/actions";

/**
 * Désabonnement en un clic depuis le logiciel de messagerie (RFC 8058) :
 * POST envoyé par la messagerie elle-même, le jeton signé est le seul justificatif.
 */
export async function POST(req: NextRequest) {
  const jeton = req.nextUrl.searchParams.get("j") ?? "";
  const fait = await desabonner(jeton);
  return new NextResponse(fait ? "ok\n" : "lien invalide\n", { status: fait ? 200 : 400, headers: { "cache-control": "no-store" } });
}
