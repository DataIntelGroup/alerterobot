import type { Metadata } from "next";
import { gardeAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dateCourte, heure } from "@/lib/format";

export const metadata: Metadata = { title: "Journal" };

type Ligne = { le: string; action: string; organisation: string | null; utilisateur: string | null; cible: string | null; details: Record<string, unknown> };

const ACTIONS: Record<string, string> = {
  organisation_creee: "Organisation créée",
  incident_vu: "« J'ai vu »",
  heartbeat_regenere: "Jeton heartbeat régénéré",
  faux_positif_evite: "Faux positif évité",
  forfait: "Changement de forfait",
  envoi_echec: "Envoi d'alerte en échec",
};

export default async function Journal({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await gardeAdmin();
  const { action } = await searchParams;
  const filtre = typeof action === "string" && action in ACTIONS ? action : null;
  const { data, error } = await supabaseAdmin().rpc("admin_journal", { p_action: filtre, p_limite: 300 });
  const lignes = (data ?? []) as Ligne[];

  return (
    <div className="pile">
      <div className="entete">
        <div>
          <h1>Journal</h1>
          <p className="pale">Actions des comptes, décisions du moteur et envois en échec · 300 dernières lignes</p>
        </div>
      </div>
      <form className="filtres" method="get">
        <div className="champ">
          <label htmlFor="action">Type d&apos;évènement</label>
          <select id="action" name="action" defaultValue={filtre ?? ""}>
            <option value="">Tous</option>
            {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button type="submit" className="bouton secondaire">Filtrer</button>
      </form>
      {error && <p role="alert" className="alerte erreur">Journal indisponible : la base ne répond pas.</p>}
      <section className="carte" aria-label="Évènements">
        {lignes.length === 0 ? <p className="doux">Aucun évènement.</p> : (
          <div className="table-boite">
            <table>
              <thead><tr><th scope="col">Date</th><th scope="col">Évènement</th><th scope="col">Organisation</th><th scope="col">Par</th><th scope="col">Détail</th></tr></thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={`${l.le}-${i}`}>
                    <td className="mono nowrap">{dateCourte(l.le)} {heure(l.le)}</td>
                    <td className={l.action === "envoi_echec" ? "etat-panne" : undefined}>{ACTIONS[l.action] ?? l.action}</td>
                    <td>{l.organisation ?? "—"}</td>
                    <td>{l.utilisateur ?? (l.action === "faux_positif_evite" || l.action === "envoi_echec" ? "moteur" : "—")}</td>
                    <td className="pale">{[l.cible, Object.keys(l.details ?? {}).length ? JSON.stringify(l.details) : null].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
