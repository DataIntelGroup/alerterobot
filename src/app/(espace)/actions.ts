"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { espace, peutEcrire, utilisateur } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { verifierAdresse } from "@/lib/securite/adresse";

// Chaque action revérifie la session et passe par le client utilisateur :
// la RLS et les fonctions SQL refont le contrôle d'accès, côté base.

export type EtatForm = { erreur?: string; jetonHeartbeat?: string; moniteurId?: string } | undefined;

const uuid = z.string().uuid();

export async function creerOrganisation(_: EtatForm, form: FormData): Promise<EtatForm> {
  const user = await utilisateur();
  if (!user) redirect("/connexion");
  const nom = z.string().trim().min(2, "2 caractères au moins.").max(80).safeParse(form.get("nom"));
  if (!nom.success) return { erreur: nom.error.issues[0].message };
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("creer_organisation", { p_nom: nom.data });
  if (error) return { erreur: error.code === "P0001" ? error.message : "La création n'a pas abouti. Réessayez dans un instant." };
  redirect("/moniteurs/nouveau?bienvenue=1");
}

export async function accuserReception(form: FormData): Promise<void> {
  const id = uuid.safeParse(form.get("incident"));
  if (!id.success) return;
  const { supabase } = await espace();
  await supabase.rpc("accuser_reception", { p_incident: id.data });
  revalidatePath("/tableau-de-bord");
  revalidatePath(`/incidents/${id.data}`);
}

const schemaMoniteur = z.object({
  nom: z.string().trim().min(2, "Nom : 2 caractères au moins.").max(80),
  type: z.enum(["http", "mot_cle", "api", "paiement", "heartbeat"]),
  url: z.string().trim().max(2048).optional(),
  mot_cle: z.string().trim().max(200).optional(),
  champ_json: z.string().trim().max(200).regex(/^([A-Za-z0-9_]+(\.[A-Za-z0-9_]+){0,9})?$/, "Champ JSON : lettres, chiffres et points.").optional(),
  seuil_lent_ms: z.coerce.number().int().min(100).max(30000),
  intervalle_s: z.coerce.number().int().min(60).max(3600),
  heartbeat_periode_s: z.coerce.number().int().min(60).max(2678400).optional(),
  heartbeat_duree_max_s: z.coerce.number().int().min(60).max(86400).optional(),
  critique: z.literal("oui").optional(),
  client_id: z.union([uuid, z.literal("")]).optional(),
});

export async function creerMoniteur(_: EtatForm, form: FormData): Promise<EtatForm> {
  const { supabase, org } = await espace();
  if (!peutEcrire(org.role)) return { erreur: "Votre rôle ne permet pas d'ajouter un moniteur." };
  const brut = Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" && v !== "" ? v : undefined]));
  const d = schemaMoniteur.safeParse(brut);
  if (!d.success) return { erreur: d.error.issues[0].message };
  const m = d.data;

  let url: string | null = null;
  if (m.type !== "heartbeat") {
    const adresse = verifierAdresse(m.url ?? "");
    if (!adresse.ok) return { erreur: adresse.raison };
    url = adresse.url.href;
    if (m.type === "mot_cle" && !m.mot_cle) return { erreur: "Indiquez le mot-clé attendu sur la page." };
  } else if (!m.heartbeat_periode_s) {
    return { erreur: "Indiquez tous les combien la tâche doit appeler AlerteRobot." };
  }

  const { data: cree, error } = await supabase.from("moniteurs").insert({
    org_id: org.id,
    client_id: m.client_id || null,
    nom: m.nom,
    type: m.type,
    url,
    mot_cle: m.type === "heartbeat" ? null : m.mot_cle ?? null,
    champ_json: m.type === "api" ? m.champ_json ?? null : null,
    seuil_lent_ms: m.seuil_lent_ms,
    intervalle_s: m.intervalle_s,
    critique: m.critique === "oui",
    heartbeat_periode_s: m.type === "heartbeat" ? m.heartbeat_periode_s : null,
    heartbeat_duree_max_s: m.type === "heartbeat" ? m.heartbeat_duree_max_s ?? null : null,
  }).select("id").single();
  if (error) return { erreur: error.code === "P0001" ? error.message : "Ce moniteur n'a pas pu être enregistré. Vérifiez l'adresse, puis réessayez." };

  // Les contacts sont rattachés par la base, chacun à son niveau d'escalade.
  revalidatePath("/tableau-de-bord");
  if (m.type === "heartbeat") {
    const { data: jeton } = await supabase.rpc("regenerer_heartbeat", { p_moniteur: cree.id });
    return { jetonHeartbeat: jeton as string, moniteurId: cree.id };
  }
  redirect("/tableau-de-bord");
}

const schemaPush = z.object({
  endpoint: z.string().url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});

export async function enregistrerPush(abonnement: unknown): Promise<{ ok: boolean }> {
  const { supabase } = await espace();
  const d = schemaPush.safeParse(abonnement);
  if (!d.success) return { ok: false };
  const { error } = await supabase.rpc("enregistrer_push", {
    p_endpoint: d.data.endpoint, p_p256dh: d.data.keys.p256dh, p_auth: d.data.keys.auth,
  });
  return { ok: !error };
}

// ---------------------------------------------------------------- Lot 1

export type EtatSimple = { erreur?: string; ok?: string } | undefined;

const REFUS = "Votre rôle ne permet pas cette action. Demandez à un administrateur de l'organisation.";
const champ = (form: FormData, nom: string) => {
  const v = form.get(nom);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};

export async function publierMaj(_: EtatSimple, form: FormData): Promise<EtatSimple> {
  const { supabase } = await espace();
  const d = z.object({
    incident: uuid,
    etape: z.enum(["analyse", "identifie", "surveillance", "resolu"]),
    message: z.string().min(3, "Écrivez quelques mots pour vos clients.").max(1000, "1 000 caractères au plus."),
  }).safeParse({ incident: champ(form, "incident"), etape: champ(form, "etape"), message: champ(form, "message") });
  if (!d.success) return { erreur: d.error.issues[0].message };
  const { error } = await supabase.rpc("publier_maj", {
    p_incident: d.data.incident, p_etape: d.data.etape, p_message: d.data.message, p_publique: form.get("publique") === "oui",
  });
  if (error) return { erreur: error.code === "42501" ? REFUS : "La mise à jour n'a pas été publiée. Réessayez." };
  revalidatePath(`/incidents/${d.data.incident}`);
  return { ok: form.get("publique") === "oui" ? "Publiée sur la page de statut et envoyée aux abonnés." : "Ajoutée à la chronologie interne." };
}

// Les dates saisies sont en heure d'Abidjan, qui est l'heure UTC toute l'année.
const dateAbidjan = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? new Date(`${v}:00Z`) : null);

export async function creerMaintenance(_: EtatSimple, form: FormData): Promise<EtatSimple> {
  const { supabase, org } = await espace();
  if (!peutEcrire(org.role)) return { erreur: REFUS };
  const debut = dateAbidjan(champ(form, "debut"));
  const fin = dateAbidjan(champ(form, "fin"));
  const moniteur = champ(form, "moniteur");
  const motif = champ(form, "motif");
  if (!debut || !fin) return { erreur: "Indiquez le début et la fin de la maintenance." };
  if (fin <= debut) return { erreur: "La fin doit venir après le début." };
  if (fin.getTime() - debut.getTime() > 7 * 86400000) return { erreur: "Une maintenance dure 7 jours au plus." };
  if (fin.getTime() < Date.now()) return { erreur: "Cette période est déjà passée." };
  if (moniteur && !uuid.safeParse(moniteur).success) return { erreur: "Moniteur inconnu." };
  if (motif && motif.length > 200) return { erreur: "Le motif tient en 200 caractères." };
  const { error } = await supabase.from("maintenances").insert({
    org_id: org.id, moniteur_id: moniteur ?? null, debut: debut.toISOString(), fin: fin.toISOString(),
    motif: motif ?? null, publique: form.get("publique") === "oui",
  });
  if (error) return { erreur: "La maintenance n'a pas été enregistrée. Vérifiez les dates." };
  revalidatePath("/maintenances");
  return { ok: form.get("publique") === "oui" ? "Maintenance programmée et annoncée à vos abonnés." : "Maintenance programmée. Aucune alerte ne partira pendant ce créneau." };
}

export async function supprimerMaintenance(form: FormData): Promise<void> {
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return;
  const { supabase } = await espace();
  await supabase.from("maintenances").delete().eq("id", id.data);
  revalidatePath("/maintenances");
}

export async function ajouterContact(_: EtatSimple, form: FormData): Promise<EtatSimple> {
  const { supabase, org } = await espace();
  const d = z.object({
    nom: z.string().min(2, "Nom : 2 caractères au moins.").max(80),
    email: z.string().toLowerCase().email("Adresse email invalide.").max(254),
    niveau: z.coerce.number().int().min(1).max(5),
  }).safeParse({ nom: champ(form, "nom"), email: champ(form, "email"), niveau: champ(form, "niveau") ?? "1" });
  if (!d.success) return { erreur: d.error.issues[0].message };
  const { error } = await supabase.from("contacts").insert({ org_id: org.id, ...d.data });
  if (error) {
    if (error.code === "P0001") return { erreur: `${error.message} Passez au forfait supérieur pour en ajouter.` };
    return { erreur: error.code === "42501" ? REFUS : "Ce contact n'a pas été ajouté. Réessayez." };
  }
  revalidatePath("/alertes");
  return { ok: `${d.data.nom} sera prévenu${d.data.niveau > 1 ? ` au niveau ${d.data.niveau}, si personne ne répond avant` : " dès la première alerte"}.` };
}

export async function modifierContact(form: FormData): Promise<void> {
  const { supabase } = await espace();
  const id = uuid.safeParse(form.get("id"));
  const niveau = z.coerce.number().int().min(1).max(5).safeParse(form.get("niveau"));
  const jours = form.getAll("jours").map(Number).filter((j) => Number.isInteger(j) && j >= 1 && j <= 7);
  if (!id.success || !niveau.success || jours.length === 0) return;
  await supabase.from("contacts").update({ niveau: niveau.data, astreinte_jours: [...new Set(jours)], actif: form.get("actif") === "oui" }).eq("id", id.data);
  revalidatePath("/alertes");
}

export async function supprimerContact(form: FormData): Promise<void> {
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return;
  const { supabase } = await espace();
  await supabase.from("contacts").delete().eq("id", id.data);
  revalidatePath("/alertes");
}

export async function creerPageStatut(_: EtatSimple, form: FormData): Promise<EtatSimple> {
  const { supabase, org } = await espace();
  const d = z.object({
    nom: z.string().min(2, "Nom : 2 caractères au moins.").max(80),
    slug: z.string().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, "Adresse : 3 à 40 lettres minuscules, chiffres ou tirets."),
  }).safeParse({ nom: champ(form, "nom"), slug: champ(form, "slug") });
  if (!d.success) return { erreur: d.error.issues[0].message };
  if (["confirmer", "desabonner"].includes(d.data.slug)) return { erreur: "Cette adresse est réservée. Essayez une variante." };
  const { error } = await supabase.from("clients").insert({ org_id: org.id, nom: d.data.nom, slug_statut: d.data.slug });
  if (error) {
    if (error.code === "23505") return { erreur: "Cette adresse est déjà prise. Essayez une variante." };
    return { erreur: error.code === "42501" ? REFUS : "La page n'a pas été créée. Réessayez." };
  }
  revalidatePath("/pages-statut");
  return { ok: "Page créée. Choisissez maintenant les services à y afficher." };
}

// ---------------------------------------------------------------- Réglages de l'organisation

export async function enregistrerReglages(_: EtatSimple, form: FormData): Promise<EtatSimple> {
  const { supabase, org } = await espace();
  if (org.role !== "proprietaire" && org.role !== "admin") return { erreur: REFUS };
  const heure = z.union([z.string().regex(/^\d{2}:\d{2}$/), z.literal("")]);
  const d = z.object({
    nom: z.string().trim().min(2, "Nom : 2 caractères au moins.").max(80),
    rappel_min: z.coerce.number().refine((v) => v === 15 || v === 30),
    escalade_min: z.coerce.number().int().min(10).max(240),
    silence_debut: heure, silence_fin: heure,
  }).safeParse({ nom: champ(form, "nom"), rappel_min: champ(form, "rappel_min"), escalade_min: champ(form, "escalade_min"),
    silence_debut: champ(form, "silence_debut") ?? "", silence_fin: champ(form, "silence_fin") ?? "" });
  if (!d.success) return { erreur: d.error.issues[0].message };
  const silence = form.get("silence") === "oui" && d.data.silence_debut && d.data.silence_fin;
  if (form.get("silence") === "oui" && !silence) return { erreur: "Indiquez le début et la fin des heures silencieuses." };
  const { error } = await supabase.from("organisations").update({
    nom: d.data.nom, rappel_min: d.data.rappel_min, escalade_min: d.data.escalade_min,
    silence_debut: silence ? d.data.silence_debut : null, silence_fin: silence ? d.data.silence_fin : null,
  }).eq("id", org.id);
  if (error) return { erreur: "Les réglages n'ont pas été enregistrés. Réessayez." };
  revalidatePath("/reglages");
  return { ok: "Réglages enregistrés." };
}

// ---------------------------------------------------------------- Gestion d'un moniteur

const schemaModif = z.object({
  id: uuid,
  nom: z.string().trim().min(2, "Nom : 2 caractères au moins.").max(80),
  url: z.string().trim().max(2048).optional(),
  mot_cle: z.string().trim().max(200).optional(),
  champ_json: z.string().trim().max(200).regex(/^([A-Za-z0-9_]+(\.[A-Za-z0-9_]+){0,9})?$/, "Champ JSON : lettres, chiffres et points.").optional(),
  seuil_lent_ms: z.coerce.number().int().min(100).max(30000).optional(),
  intervalle_s: z.coerce.number().int().min(60).max(3600).optional(),
  heartbeat_periode_s: z.coerce.number().int().min(60).max(2678400).optional(),
  heartbeat_duree_max_s: z.union([z.coerce.number().int().min(60).max(86400), z.literal("")]).optional(),
  client_id: z.union([uuid, z.literal("")]).optional(),
});

export async function modifierMoniteur(_: EtatSimple, form: FormData): Promise<EtatSimple> {
  const { supabase, org } = await espace();
  if (!peutEcrire(org.role)) return { erreur: REFUS };
  const brut = Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v.trim() : undefined]));
  const d = schemaModif.safeParse(brut);
  if (!d.success) return { erreur: d.error.issues[0].message };
  const { data: actuel } = await supabase.from("moniteurs").select("type").eq("id", d.data.id).maybeSingle();
  if (!actuel) return { erreur: "Moniteur introuvable." };

  const maj: Record<string, unknown> = { nom: d.data.nom, critique: form.get("critique") === "oui", client_id: d.data.client_id || null };
  if (actuel.type === "heartbeat") {
    if (d.data.heartbeat_periode_s) maj.heartbeat_periode_s = d.data.heartbeat_periode_s;
    maj.heartbeat_duree_max_s = d.data.heartbeat_duree_max_s || null;
  } else {
    const adresse = verifierAdresse(d.data.url ?? "");
    if (!adresse.ok) return { erreur: adresse.raison };
    if (actuel.type === "mot_cle" && !d.data.mot_cle) return { erreur: "Indiquez le texte attendu sur la page." };
    Object.assign(maj, {
      url: adresse.url.href,
      mot_cle: d.data.mot_cle || null,
      champ_json: actuel.type === "api" ? d.data.champ_json || null : null,
      seuil_lent_ms: d.data.seuil_lent_ms ?? 2000,
      intervalle_s: d.data.intervalle_s ?? 300,
    });
  }
  const { error } = await supabase.from("moniteurs").update(maj).eq("id", d.data.id);
  if (error) return { erreur: "Les modifications n'ont pas été enregistrées. Réessayez." };
  revalidatePath(`/moniteurs/${d.data.id}`);
  revalidatePath("/tableau-de-bord");
  return { ok: "Modifications enregistrées. Elles s'appliquent dès la prochaine vérification." };
}

export async function basculerPause(form: FormData): Promise<void> {
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return;
  const { supabase } = await espace();
  await supabase.from("moniteurs").update({ actif: form.get("actif") === "oui" }).eq("id", id.data);
  revalidatePath(`/moniteurs/${id.data}`);
  revalidatePath("/tableau-de-bord");
}

export async function supprimerMoniteur(form: FormData): Promise<void> {
  const id = uuid.safeParse(form.get("id"));
  if (!id.success || form.get("confirmation") !== "oui") return;
  const { supabase } = await espace();
  await supabase.from("moniteurs").delete().eq("id", id.data);
  revalidatePath("/tableau-de-bord");
  redirect("/tableau-de-bord");
}

export async function nouveauJetonHeartbeat(_: EtatForm, form: FormData): Promise<EtatForm> {
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return { erreur: "Moniteur introuvable." };
  const { supabase } = await espace();
  const { data, error } = await supabase.rpc("regenerer_heartbeat", { p_moniteur: id.data });
  if (error) return { erreur: error.code === "42501" ? REFUS : "Le nouveau jeton n'a pas été créé." };
  return { jetonHeartbeat: data as string, moniteurId: id.data };
}

// ---------------------------------------------------------------- Lot 2 : intégrations

export type EtatIntegration = { erreur?: string; secret?: string; code?: string } | undefined;

export async function creerWebhook(_: EtatIntegration, form: FormData): Promise<EtatIntegration> {
  const { supabase, org } = await espace();
  const nom = z.string().min(2, "Nom : 2 caractères au moins.").max(80).safeParse(champ(form, "nom"));
  if (!nom.success) return { erreur: nom.error.issues[0].message };
  const adresse = verifierAdresse(champ(form, "url") ?? "");
  if (!adresse.ok) return { erreur: adresse.raison };
  if (adresse.url.protocol !== "https:") return { erreur: "L'adresse du webhook doit commencer par https://." };
  const { data, error } = await supabase.rpc("creer_webhook", { p_org: org.id, p_nom: nom.data, p_url: adresse.url.href });
  if (error) return { erreur: error.code === "42501" ? REFUS : error.code === "P0001" ? error.message : "Le webhook n'a pas été créé. Réessayez." };
  revalidatePath("/integrations");
  return { secret: (data as { secret: string }[])[0]?.secret };
}

export async function lienTelegram(_: EtatIntegration, form: FormData): Promise<EtatIntegration> {
  const { supabase, org } = await espace();
  const nom = z.string().min(2, "Nom : 2 caractères au moins.").max(80).safeParse(champ(form, "nom") ?? "Groupe Telegram");
  if (!nom.success) return { erreur: nom.error.issues[0].message };
  const { data, error } = await supabase.rpc("creer_lien_telegram", { p_org: org.id, p_nom: nom.data });
  if (error) return { erreur: error.code === "42501" ? REFUS : error.code === "P0001" ? error.message : "Le lien n'a pas été créé. Réessayez." };
  revalidatePath("/integrations");
  return { code: data as string };
}

export async function basculerIntegration(form: FormData): Promise<void> {
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return;
  const { supabase } = await espace();
  await supabase.from("integrations").update({ actif: form.get("actif") === "oui" }).eq("id", id.data);
  revalidatePath("/integrations");
}

export async function supprimerIntegration(form: FormData): Promise<void> {
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return;
  const { supabase } = await espace();
  await supabase.from("integrations").delete().eq("id", id.data);
  revalidatePath("/integrations");
}

export async function afficherSurPage(form: FormData): Promise<void> {
  const { supabase } = await espace();
  const moniteur = uuid.safeParse(form.get("moniteur"));
  const client = uuid.safeParse(form.get("client"));
  if (!moniteur.success || !client.success) return;
  const visible = form.get("visible") === "oui";
  await supabase.from("moniteurs").update(visible ? { client_id: client.data, public: true } : { public: false }).eq("id", moniteur.data);
  revalidatePath("/pages-statut");
}
