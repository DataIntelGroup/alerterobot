"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { ipVisiteur, sousLimite } from "@/lib/securite/limite";

export type Etat = { erreur?: string; message?: string } | undefined;

const email = z.string().trim().toLowerCase().email("Adresse email invalide.").max(254);
// Longueur plutôt que règles de composition (recommandation NIST SP 800-63B).
const motDePasse = z.string().min(12, "12 caractères au moins.").max(128, "128 caractères au plus.");

const TROP = "Trop de tentatives. Réessayez dans quelques minutes.";

export async function connexion(_: Etat, form: FormData): Promise<Etat> {
  const donnees = z.object({ email, motDePasse: z.string().min(1).max(128) }).safeParse({
    email: form.get("email"), motDePasse: form.get("motDePasse"),
  });
  if (!donnees.success) return { erreur: "Email ou mot de passe incorrect." };
  const ip = await ipVisiteur();
  const [parIp, parCompte] = await Promise.all([
    sousLimite(`connexion:ip:${ip}`, 30, 900),
    sousLimite(`connexion:email:${donnees.data.email}`, 10, 900),
  ]);
  if (!parIp || !parCompte) return { erreur: TROP };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email: donnees.data.email, password: donnees.data.motDePasse });
  // Même message que le compte existe ou non : pas d'énumération des comptes.
  if (error) return { erreur: "Email ou mot de passe incorrect." };
  redirect("/tableau-de-bord");
}

export async function inscription(_: Etat, form: FormData): Promise<Etat> {
  const donnees = z.object({ email, motDePasse }).safeParse({ email: form.get("email"), motDePasse: form.get("motDePasse") });
  if (!donnees.success) return { erreur: donnees.error.issues[0]?.message ?? "Formulaire invalide." };
  if (form.get("conditions") !== "oui") return { erreur: "Acceptez les conditions d'utilisation pour continuer." };
  if (!(await sousLimite(`inscription:ip:${await ipVisiteur()}`, 5, 3600))) return { erreur: TROP };

  const supabase = await supabaseServer();
  const appUrl = (process.env.APP_URL ?? "http://localhost:3500").replace(/\/$/, "");
  await supabase.auth.signUp({
    email: donnees.data.email,
    password: donnees.data.motDePasse,
    options: { emailRedirectTo: `${appUrl}/auth/confirmation` },
  });
  // Réponse identique si l'adresse a déjà un compte.
  return { message: "Si cette adresse est valide, un email de confirmation vient de partir. Ouvrez-le pour activer votre compte." };
}

export async function motDePasseOublie(_: Etat, form: FormData): Promise<Etat> {
  const d = email.safeParse(form.get("email"));
  if (!d.success) return { erreur: "Adresse email invalide." };
  const [parIp, parCompte] = await Promise.all([
    sousLimite(`oubli:ip:${await ipVisiteur()}`, 5, 3600),
    sousLimite(`oubli:email:${d.data}`, 3, 3600),
  ]);
  if (!parIp || !parCompte) return { erreur: TROP };
  const appUrl = (process.env.APP_URL ?? "http://localhost:3500").replace(/\/$/, "");
  const supabase = await supabaseServer();
  await supabase.auth.resetPasswordForEmail(d.data, { redirectTo: `${appUrl}/auth/confirmation?suite=nouveau-mot-de-passe` });
  // Même réponse que le compte existe ou non.
  return { message: "Si un compte existe avec cette adresse, un lien pour choisir un nouveau mot de passe vient de partir. Ouvrez-le dans ce navigateur, dans l'heure." };
}

export async function nouveauMotDePasse(_: Etat, form: FormData): Promise<Etat> {
  const d = motDePasse.safeParse(form.get("motDePasse"));
  if (!d.success) return { erreur: d.error.issues[0].message };
  if (form.get("motDePasse") !== form.get("confirmation")) return { erreur: "Les deux mots de passe ne sont pas identiques." };
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erreur: "Le lien a expiré. Refaites une demande depuis « Mot de passe oublié »." };
  const { error } = await supabase.auth.updateUser({ password: d.data });
  if (error) return { erreur: error.code === "same_password" ? "Choisissez un mot de passe différent de l'ancien." : "Le mot de passe n'a pas été changé. Réessayez." };
  redirect("/tableau-de-bord");
}

export async function deconnexion(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/connexion");
}
