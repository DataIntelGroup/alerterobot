"use server";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ipVisiteur, sousLimite } from "@/lib/securite/limite";
import { signer, verifierJeton } from "@/lib/liens-signes";
import { echapper, emailStatut, envoyerEmail } from "@/lib/email/envoyer";

export type EtatAbonnement = { ok?: string; erreur?: string } | undefined;

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const secret = () => process.env.ALERTEROBOT_SECRET_LIENS ?? "";
const appUrl = () => (process.env.APP_URL ?? "http://localhost:3500").replace(/\/$/, "");
// Même réponse que l'adresse soit nouvelle, déjà abonnée ou invalide : rien à apprendre en essayant.
const REPONSE = "C'est noté. Si l'adresse est valide, un email de confirmation vient de partir : ouvrez-le pour finaliser l'abonnement.";

export async function abonner(_: EtatAbonnement, form: FormData): Promise<EtatAbonnement> {
  const slug = String(form.get("slug") ?? "");
  const email = z.string().trim().toLowerCase().email().max(254).safeParse(form.get("email"));
  if (!SLUG.test(slug) || !email.success) return { erreur: "Vérifiez l'adresse email." };
  const ip = await ipVisiteur();
  const [parIp, parPage] = await Promise.all([sousLimite(`abonnement:ip:${ip}`, 5, 3600), sousLimite(`abonnement:page:${slug}`, 200, 3600)]);
  if (!parIp || !parPage) return { erreur: "Trop de demandes. Réessayez dans une heure." };
  if (secret().length < 32) return { erreur: "Les abonnements ne sont pas encore ouverts sur cette page." };

  const { data } = await supabaseAdmin().rpc("abonner_statut", { p_slug: slug, p_email: email.data });
  const ligne = (data as { abonne_id: string; client_nom: string; deja_confirme: boolean }[] | null)?.[0];
  if (ligne && !ligne.deja_confirme) {
    const lien = `${appUrl()}/statut/confirmer?j=${signer("confirmer", ligne.abonne_id, secret(), 7 * 86400)}`;
    await envoyerEmail({
      a: email.data,
      sujet: `Confirmez votre abonnement · ${ligne.client_nom}`,
      html: emailStatut({
        titre: `Suivre l'état des services de ${ligne.client_nom}`,
        corps: "Confirmez votre adresse pour être prévenu par email des incidents et des maintenances programmées. Le lien est valable 7 jours.",
        bouton: { lien, texte: "Confirmer mon abonnement" },
        pied: `Vous n'avez rien demandé ? Ignorez cet email : sans confirmation, vous ne recevrez rien. ${echapper(ligne.client_nom)} utilise AlerteRobot.`,
      }),
      texte: `Confirmez votre abonnement à l'état des services de ${ligne.client_nom} : ${lien}`,
    }).catch(() => undefined);
  }
  return { ok: REPONSE };
}

export async function confirmerAbonnement(jeton: string): Promise<string | null> {
  const id = verifierJeton("confirmer", jeton, secret());
  if (!id) return null;
  const { data } = await supabaseAdmin().rpc("confirmer_abonnement", { p_id: id });
  return (data as string | null) ?? null;
}

export async function desabonner(jeton: string): Promise<string | null> {
  const id = verifierJeton("desabonner", jeton, secret());
  if (!id) return null;
  const { data } = await supabaseAdmin().rpc("desabonner", { p_id: id });
  return (data as string | null) ?? "ok";
}

export async function actionConfirmer(_: { fait?: string; erreur?: boolean } | undefined, form: FormData) {
  const nom = await confirmerAbonnement(String(form.get("j") ?? ""));
  return nom ? { fait: nom } : { erreur: true };
}

export async function actionDesabonner(_: { fait?: string; erreur?: boolean } | undefined, form: FormData) {
  const nom = await desabonner(String(form.get("j") ?? ""));
  return nom ? { fait: nom } : { erreur: true };
}
