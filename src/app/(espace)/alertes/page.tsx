import type { Metadata } from "next";
import { espace } from "@/lib/session";
import { modifierContact, supprimerContact } from "../actions";
import { ActiverPush } from "./ActiverPush";
import { AjoutContact } from "./AjoutContact";

export const metadata: Metadata = { title: "Contacts et alertes" };

const JOURS = [[1, "Lun"], [2, "Mar"], [3, "Mer"], [4, "Jeu"], [5, "Ven"], [6, "Sam"], [7, "Dim"]] as const;
const NIVEAUX: Record<number, string> = { 1: "Prévenu tout de suite", 2: "Après 30 min sans réponse", 3: "En dernier recours" };

type Contact = { id: string; nom: string; email: string | null; user_id: string | null; actif: boolean; niveau: number; astreinte_jours: number[] };

export default async function PageAlertes() {
  const { supabase, org, user } = await espace();
  const [{ data }, { count: appareils }] = await Promise.all([
    supabase.from("contacts").select("id, nom, email, user_id, actif, niveau, astreinte_jours").eq("org_id", org.id).order("niveau").order("cree_le"),
    supabase.from("abonnements_push").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  const contacts = (data ?? []) as Contact[];
  const gerer = org.role === "proprietaire" || org.role === "admin";
  const n = appareils ?? 0;
  return (
    <div className="etroit pile">
      <div>
        <h1>Contacts et alertes</h1>
        <p className="doux">Quand une panne est confirmée, AlerteRobot prévient d&apos;abord le niveau 1. Si personne ne répond « J&apos;ai vu » dans les 30 minutes, le niveau suivant est prévenu. Les jours d&apos;astreinte décident qui reçoit l&apos;alerte selon le jour.</p>
      </div>

      <section className="carte pile" aria-labelledby="titre-push">
        <div>
          <h2 id="titre-push">Recevoir les alertes sur ce téléphone</h2>
          <p className="pale">{n ? `${n} appareil${n > 1 ? "s" : ""} déjà abonné${n > 1 ? "s" : ""} à votre nom.` : "Aucun appareil abonné : pour l'instant, vous n'êtes prévenu que par email."}</p>
        </div>
        <ol className="etapes-num">
          <li>Ouvrez cette page sur le téléphone qui doit recevoir les alertes.</li>
          <li>Sur iPhone, touchez Partager puis « Sur l&apos;écran d&apos;accueil », et rouvrez AlerteRobot depuis l&apos;icône (iOS 16.4 ou plus récent).</li>
          <li>Touchez le bouton ci-dessous, puis « Autoriser ».</li>
        </ol>
        <ActiverPush cle={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
      </section>

      <section className="carte pile" aria-labelledby="titre-contacts">
        <div className="carte-tete"><h2 id="titre-contacts">Qui prévenir, et dans quel ordre</h2><span className="pale">{contacts.length} contact{contacts.length > 1 ? "s" : ""}</span></div>
        <ul className="contacts">
          {contacts.map((c) => (
            <li key={c.id} className={c.actif ? undefined : "inactif"}>
              <form action={modifierContact} className="contact">
                <input type="hidden" name="id" value={c.id} />
                <div className="contact-tete">
                  <span className={`niveau n${c.niveau}`} aria-hidden="true">{c.niveau}</span>
                  <div>
                    <strong>{c.nom}</strong>{c.user_id === user.id && <span className="pale"> (vous)</span>}
                    <p className="pale">{[c.email, c.user_id && "notifications push"].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
                {gerer ? (
                  <>
                    <div className="grille-champs">
                      <div className="champ">
                        <label htmlFor={`niveau-${c.id}`}>Niveau</label>
                        <select id={`niveau-${c.id}`} name="niveau" defaultValue={String(c.niveau)}>
                          {[1, 2, 3].map((v) => <option key={v} value={v}>{v} · {NIVEAUX[v]}</option>)}
                        </select>
                      </div>
                      <fieldset className="champ jours">
                        <legend>Jours d&apos;astreinte</legend>
                        <div>
                          {JOURS.map(([v, t]) => (
                            <label key={v} className="jour">
                              <input type="checkbox" name="jours" value={v} defaultChecked={c.astreinte_jours.includes(v)} />
                              <span>{t}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </div>
                    <div className="contact-actions">
                      <label className="case"><input type="checkbox" name="actif" value="oui" defaultChecked={c.actif} /><span>Reçoit les alertes</span></label>
                      <button type="submit" className="bouton secondaire">Enregistrer</button>
                      {c.user_id !== user.id && <button type="submit" formAction={supprimerContact} className="lien-bouton">Retirer</button>}
                    </div>
                  </>
                ) : (
                  <p className="pale">Niveau {c.niveau} · {c.astreinte_jours.length === 7 ? "tous les jours" : JOURS.filter(([v]) => c.astreinte_jours.includes(v)).map(([, t]) => t).join(", ")}</p>
                )}
              </form>
            </li>
          ))}
        </ul>
      </section>

      {gerer && (
        <section className="carte" aria-labelledby="titre-ajout">
          <h2 id="titre-ajout" className="carte-tete">Ajouter un collègue</h2>
          <AjoutContact />
        </section>
      )}
    </div>
  );
}
