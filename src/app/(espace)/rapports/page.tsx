import type { Metadata } from "next";
import { espace } from "@/lib/session";
import { duree, pourcentage, TYPES } from "@/lib/format";
import { BoutonImprimer } from "./BoutonImprimer";

export const metadata: Metadata = { title: "Rapports" };

type Service = { nom: string; client: string; type: string; disponibilite: number; incidents: number; minutes_panne: number; plus_long_min: number; ms_moyen: number | null };
type Rapport = { mois: string; organisation?: string; services: Service[]; faux_positifs?: number; alertes?: number };

const MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;

function moisDisponibles(): { valeur: string; libelle: string }[] {
  const maintenant = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - i, 1));
    return {
      valeur: d.toISOString().slice(0, 7),
      libelle: new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(d) + (i === 0 ? " (en cours)" : ""),
    };
  });
}

export default async function Rapports({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const { supabase, org } = await espace();
  const choix = moisDisponibles();
  const demande = (await searchParams).mois;
  const mois = demande && MOIS.test(demande) && choix.some((c) => c.valeur === demande) ? demande : choix[1].valeur;
  const { data, error } = await supabase.rpc("rapport_mensuel", { p_org: org.id, p_mois: `${mois}-01` });
  const r = (data ?? { mois, services: [] }) as Rapport;
  const libelle = choix.find((c) => c.valeur === mois)?.libelle ?? mois;
  const parClient = new Map<string, Service[]>();
  for (const s of r.services) parClient.set(s.client || org.nom, [...(parClient.get(s.client || org.nom) ?? []), s]);
  const moyenne = r.services.length ? r.services.reduce((s, x) => s + Number(x.disponibilite), 0) / r.services.length : null;
  const incidents = r.services.reduce((s, x) => s + x.incidents, 0);
  const minutes = r.services.reduce((s, x) => s + x.minutes_panne, 0);

  return (
    <div className="pile rapport">
      <div className="entete">
        <div>
          <p className="pale">Rapport de disponibilité · {org.nom}</p>
          <h1>{libelle.replace(" (en cours)", "")}</h1>
        </div>
        <div className="actions-ligne sans-impression">
          <form method="get" className="filtres">
            <div className="champ">
              <label htmlFor="mois" className="masque">Mois</label>
              <select id="mois" name="mois" defaultValue={mois}>
                {choix.map((c) => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
              </select>
            </div>
            <button type="submit" className="bouton secondaire">Afficher</button>
          </form>
          <BoutonImprimer />
        </div>
      </div>

      {error && <p role="alert" className="alerte erreur">Le rapport n&apos;a pas pu être calculé. Réessayez dans un instant.</p>}

      {r.services.length === 0 ? (
        <div className="carte vide"><strong>Rien à rapporter pour ce mois</strong><p>Aucun moniteur n&apos;était actif sur cette période.</p></div>
      ) : (
        <>
          <div className="grille-kpi">
            <div className="carte"><p className="pale">Disponibilité moyenne</p><p className="kpi-valeur">{moyenne !== null ? pourcentage(moyenne) : "—"}</p><p className="pale">{r.services.length} service{r.services.length > 1 ? "s" : ""} surveillé{r.services.length > 1 ? "s" : ""}</p></div>
            <div className="carte"><p className="pale">Incidents</p><p className="kpi-valeur">{incidents}</p><p className="pale">{minutes ? `${duree(minutes * 60000)} d'interruption au total` : "aucune interruption"}</p></div>
            <div className="carte"><p className="pale">Fausses alertes évitées</p><p className="kpi-valeur">{r.faux_positifs ?? 0}</p><p className="pale">échecs d&apos;un seul lieu, non confirmés</p></div>
            <div className="carte"><p className="pale">Alertes envoyées</p><p className="kpi-valeur">{r.alertes ?? 0}</p><p className="pale">email, notifications et intégrations</p></div>
          </div>

          {[...parClient.entries()].map(([client, services]) => (
            <section key={client} className="carte" aria-label={`Services de ${client}`}>
              <h2 className="carte-tete">{client}</h2>
              <div className="table-boite">
                <table>
                  <thead><tr><th scope="col">Service</th><th scope="col">Type</th><th scope="col" className="droite">Disponibilité</th><th scope="col" className="droite">Incidents</th><th scope="col" className="droite">Interruption</th><th scope="col" className="droite">Réponse moyenne</th></tr></thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.nom}>
                        <td><strong>{s.nom}</strong>{s.plus_long_min > 0 && <span className="pale">plus longue : {duree(s.plus_long_min * 60000)}</span>}</td>
                        <td>{TYPES[s.type] ?? s.type}</td>
                        <td className={`mono droite ${Number(s.disponibilite) < 99.5 ? "ambre-txt" : "vert-txt"}`}>{pourcentage(Number(s.disponibilite))}</td>
                        <td className="mono droite">{s.incidents}</td>
                        <td className="mono droite">{s.minutes_panne ? duree(s.minutes_panne * 60000) : "—"}</td>
                        <td className="mono droite">{s.ms_moyen !== null ? `${s.ms_moyen} ms` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          <p className="pale">Disponibilité calculée sur le temps où chaque service était surveillé, hors maintenances programmées. Pannes confirmées depuis Abidjan et Paris.</p>
        </>
      )}
    </div>
  );
}
