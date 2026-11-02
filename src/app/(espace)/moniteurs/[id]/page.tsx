import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { espace, peutEcrire } from "@/lib/session";
import { ETATS, TYPES, dateCourte, duree, heure, ilYA, pourcentage } from "@/lib/format";
import { basculerPause, supprimerMoniteur } from "../../actions";
import { FormulaireModif, NouveauJeton, type MoniteurModif } from "./FormulaireModif";

export const metadata: Metadata = { title: "Moniteur" };

const LIEUX: Record<string, string> = { abidjan: "Abidjan", paris: "Paris" };
const TRENTE_JOURS = 30 * 86400000;

export default async function PageMoniteur({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, org } = await espace();
  // La RLS ne renvoie le moniteur que s'il appartient à une organisation du visiteur.
  const { data: m } = await supabase.from("moniteurs")
    .select("id, type, nom, url, mot_cle, champ_json, seuil_lent_ms, intervalle_s, critique, client_id, actif, etat, etat_depuis, derniere_verif, dernier_ms, ssl_expire_le, domaine, domaine_expire_le, heartbeat_periode_s, heartbeat_duree_max_s, heartbeat_duree_ms, dernier_signal, cree_le")
    .eq("id", id).maybeSingle();
  if (!m) notFound();
  const depuis = new Date(Date.now() - TRENTE_JOURS).toISOString();
  const [{ data: verifs }, { data: incidents }, { data: clients }] = await Promise.all([
    supabase.from("verifications").select("id, lieu, le, ok, lent, code, ms, erreur").eq("moniteur_id", id).order("le", { ascending: false }).limit(20),
    supabase.from("incidents").select("id, debut, fin, cause").eq("moniteur_id", id).or(`fin.is.null,fin.gte."${depuis}"`).order("debut", { ascending: false }).limit(10),
    supabase.from("clients").select("id, nom").eq("org_id", org.id).order("nom"),
  ]);
  const ecriture = peutEcrire(org.role);
  const maintenant = Date.now();
  const debut30 = Math.max(maintenant - TRENTE_JOURS, new Date(m.cree_le).getTime());
  const panneMs = (incidents ?? []).reduce((s, i) => s + (new Date(i.fin ?? maintenant).getTime() - Math.max(new Date(i.debut).getTime(), debut30)), 0);
  const dispo = 100 - (100 * panneMs) / Math.max(maintenant - debut30, 1);
  const appUrl = (process.env.APP_URL ?? "http://localhost:3500").replace(/\/$/, "");
  const etat = m.actif ? m.etat : "pause";

  return (
    <div className="etroit pile">
      <Link className="retour" href="/moniteurs">← Mes services</Link>
      <div className="entete">
        <div>
          <p className={`etat etat-${etat === "pause" ? "inconnu" : etat}`}>{etat === "pause" ? "En pause" : ETATS[etat] ?? etat}{etat !== "pause" && etat !== "inconnu" ? ` depuis ${duree(maintenant - new Date(m.etat_depuis).getTime())}` : ""}</p>
          <h1>{m.nom}</h1>
          <p className="pale">{TYPES[m.type] ?? m.type}{m.url ? ` · ${m.url}` : ""}</p>
        </div>
        {ecriture && (
          <form action={basculerPause}>
            <input type="hidden" name="id" value={m.id} />
            {!m.actif && <input type="hidden" name="actif" value="oui" />}
            <button type="submit" className="bouton secondaire">{m.actif ? "Mettre en pause" : "Reprendre la surveillance"}</button>
          </form>
        )}
      </div>
      {!m.actif && <p className="alerte info">La surveillance est en pause : aucune vérification, aucune alerte. Reprenez-la quand vous voulez.</p>}

      <div className="grille-kpi">
        <div className="carte"><p className="pale">Disponibilité · 30 jours</p><p className="kpi-valeur">{pourcentage(Math.max(0, dispo))}</p><p className="pale">{(incidents ?? []).length} incident{(incidents ?? []).length > 1 ? "s" : ""}</p></div>
        {m.type === "heartbeat" ? (
          <div className="carte"><p className="pale">Dernière exécution</p><p className="kpi-valeur">{m.heartbeat_duree_ms !== null ? duree(m.heartbeat_duree_ms) : "—"}</p><p className="pale">{m.dernier_signal ? `signal ${ilYA(m.dernier_signal, maintenant)}` : "aucun signal reçu"}</p></div>
        ) : (
          <div className="carte"><p className="pale">Dernière réponse</p><p className="kpi-valeur">{m.dernier_ms !== null ? `${m.dernier_ms} ms` : "—"}</p><p className="pale">{m.derniere_verif ? `vérifié ${ilYA(m.derniere_verif, maintenant)}` : "pas encore vérifié"}</p></div>
        )}
        {m.ssl_expire_le && <div className="carte"><p className="pale">Certificat SSL</p><p className="kpi-valeur">{dateCourte(m.ssl_expire_le)}</p><p className="pale">date d&apos;expiration</p></div>}
        {m.domaine_expire_le && <div className="carte"><p className="pale">Nom de domaine</p><p className="kpi-valeur">{dateCourte(m.domaine_expire_le)}</p><p className="pale">{m.domaine} expire</p></div>}
      </div>

      <section className="carte" aria-labelledby="titre-verifs">
        <div className="carte-tete"><h2 id="titre-verifs">Dernières vérifications</h2><span className="pale">depuis Abidjan et Paris</span></div>
        {(verifs ?? []).length === 0 ? <p className="pale">{m.type === "heartbeat" ? "Les signaux de la tâche s'affichent sur la carte ci-dessus." : "La première vérification arrive dans la minute."}</p> : (
          <div className="table-boite">
            <table>
              <thead><tr><th scope="col">Heure</th><th scope="col">Lieu</th><th scope="col">Résultat</th><th scope="col" className="droite">Réponse</th></tr></thead>
              <tbody>
                {(verifs ?? []).map((v) => (
                  <tr key={v.id}>
                    <td className="mono nowrap">{dateCourte(v.le)} {heure(v.le)}</td>
                    <td>{LIEUX[v.lieu] ?? v.lieu}</td>
                    <td><span className={`etat ${v.ok ? (v.lent ? "etat-lent" : "etat-ok") : "etat-panne"}`}>{v.ok ? (v.lent ? "Lent" : "OK") : v.erreur ?? "Échec"}</span></td>
                    <td className="mono droite">{v.ms !== null ? `${v.ms} ms` : "—"}{v.code ? ` · ${v.code}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(incidents ?? []).length > 0 && (
        <section className="carte" aria-labelledby="titre-incidents">
          <h2 id="titre-incidents" className="carte-tete">Incidents · 30 jours</h2>
          <ul className="liste-points">
            {(incidents ?? []).map((i) => (
              <li key={i.id} className={i.fin ? "vert" : "rouge"}>
                <div>
                  <Link href={`/incidents/${i.id}`}><strong>{dateCourte(i.debut)} · {heure(i.debut)}</strong></Link>
                  <p className="pale">{i.fin ? `Résolu après ${duree(new Date(i.fin).getTime() - new Date(i.debut).getTime())}` : "En cours"} · {i.cause ?? "cause inconnue"}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ecriture && (
        <>
          <section className="carte" aria-labelledby="titre-modif">
            <h2 id="titre-modif" className="carte-tete">Réglages</h2>
            <FormulaireModif m={m as MoniteurModif} clients={clients ?? []} forfait={org.forfait} />
          </section>
          {m.type === "heartbeat" && (
            <section className="carte" aria-labelledby="titre-jeton">
              <h2 id="titre-jeton" className="carte-tete">Adresse de la tâche</h2>
              <NouveauJeton id={m.id} appUrl={appUrl} />
            </section>
          )}
          <details className="carte zone-danger">
            <summary>Supprimer ce moniteur</summary>
            <form action={supprimerMoniteur} className="pile">
              <input type="hidden" name="id" value={m.id} />
              <p className="doux">Son historique, ses incidents et ses alertes seront effacés. Pour arrêter temporairement, préférez « Mettre en pause ».</p>
              <label className="case"><input type="checkbox" name="confirmation" value="oui" required /><span>Je comprends que c&apos;est définitif</span></label>
              <button type="submit" className="bouton danger">Supprimer définitivement</button>
            </form>
          </details>
        </>
      )}
    </div>
  );
}
