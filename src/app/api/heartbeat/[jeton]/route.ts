import type { NextRequest } from "next/server";
import { signalHeartbeat } from "@/lib/heartbeat";

/** Fin normale d'une tâche de fond : GET, HEAD ou POST sur /api/heartbeat/<jeton>. */
async function fin(req: NextRequest, { params }: { params: Promise<{ jeton: string }> }) {
  return signalHeartbeat(req, (await params).jeton, "ok");
}

export { fin as GET, fin as POST, fin as HEAD };
