import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Liens signés sans stockage (confirmation et désabonnement d'une page de statut).
 * Jeton = base64url("id.expiration") + "." + HMAC-SHA256(objet, id, expiration).
 * L'objet est signé : un lien de désabonnement ne peut pas servir à confirmer.
 * Importé par Next et par le notifieur : aucun import relatif ici.
 */

export type Objet = "confirmer" | "desabonner";

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function signature(objet: Objet, charge: string, secret: string): string {
  return createHmac("sha256", secret).update(`${objet}|${charge}`).digest("base64url");
}

/** dureeS = 0 : sans expiration. */
export function signer(objet: Objet, id: string, secret: string, dureeS = 0, maintenant = Date.now()): string {
  if (secret.length < 32) throw new Error("Secret de signature trop court (32 caractères au moins).");
  const exp = dureeS ? Math.floor(maintenant / 1000) + dureeS : 0;
  const charge = `${id}.${exp}`;
  return `${b64(charge)}.${signature(objet, charge, secret)}`;
}

/** Renvoie l'identifiant si le jeton est authentique et non expiré, sinon null. */
export function verifierJeton(objet: Objet, jeton: string, secret: string, maintenant = Date.now()): string | null {
  if (!jeton || jeton.length > 300 || secret.length < 32) return null;
  const [partie, sig] = jeton.split(".");
  if (!partie || !sig) return null;
  const charge = Buffer.from(partie, "base64url").toString("utf8");
  const attendue = Buffer.from(signature(objet, charge, secret));
  const recue = Buffer.from(sig);
  if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) return null;
  const [id, exp] = charge.split(".");
  if (!/^[0-9a-f-]{36}$/.test(id ?? "")) return null;
  if (Number(exp) !== 0 && Number(exp) < Math.floor(maintenant / 1000)) return null;
  return id;
}
