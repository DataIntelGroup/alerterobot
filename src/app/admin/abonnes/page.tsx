import type { Metadata } from "next";
import { z } from "zod";
import { gardeAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dateCourte, heure } from "@/lib/format";

export const metadata: Metadata = { title: "Abonnés" };

type Abonne = {
  id: string; nom: string; forfait: string; cree_le: string; proprietaire: string | null; membres: number;
  moniteurs: number; moniteurs_max: number; en_panne: number; incidents_30j: number; derniere_verif: string | null;
};

const NOMS: Record<string, string> = { decouverte: "Découverte", essentiel: "Essentiel", pro: "Pro", agence: "Agence" };
const filtres = z.object({
  forfait: z.enum(["decouverte", "essentiel", "pro", "agence"]).optional().catch(undefined),
  q: z.string().trim().max(80).optional().catch(undefined),
});

export default async function Abonnes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await gardeAdmin();
  const brut = await searchParams;
  const f = filtres.parse({ forfait: brut.forfait || undefined, q: typeof brut.q === "string" && brut.q ? brut.q : undefined });
  const { data, error } = await supabaseAdmin().rpc("admin_abonnes", { p_forfait: f.forfait ?? null, p_recherche: f.q ?? null });
  const liste = (data ?? []) as Abonne[];

  return (
    <div className="pile">
      <div className="entete">
        <div>
          <h1>Abonnés</h1>
          <p className="pale">{liste.length} organisation{liste.length > 1 ? "s" : ""}{liste.length === 500 ? " (500 premières)" : ""}</p>
        </div>
      </div>
      <form className="filtres" method="get">
        <div className="champ">
          <label htmlFor="q">Rechercher</label>
          <input id="q" name="q" defaultValue={f.q ?? ""} maxLength={80} placeholder="Nom de l'organisation" />
        </div>
        <div className="champ">
          <label htmlFor="forfait">Forfait</label>
          <select id="forfait" name="forfait" defaultValue={f.forfait ?? ""}>
            <option value="">Tous</option>
            {Object.entries(NOMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button type="submit" className="bouton secondaire">Filtrer</button>
      </form>
      {error && <p role="alert" className="alerte erreur">Liste indisponible : la base ne répond pas.</p>}
      <section className="carte" aria-label="Liste des abonnés">
        {liste.length === 0 ? <p className="doux">Aucune organisation ne correspond.</p> : (
          <div className="table-boite">
            <table>
              <thead>
                <tr>
                  <th scope="col">Organisation</th><th scope="col">Forfait</th><th scope="col">Moniteurs</th><th scope="col">Membres</th>
                  <th scope="col">Incidents · 30 j</th><th scope="col">Dernière vérification</th><th scope="col">Inscrite le</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.nom}</strong><span className="pale">{a.proprietaire ?? "—"}</span></td>
                    <td>{NOMS[a.forfait] ?? a.forfait}</td>
                    <td className="mono nowrap">{a.moniteurs} / {a.moniteurs_max}{a.en_panne > 0 && <span className="etat-panne"> · {a.en_panne} en panne</span>}</td>
                    <td className="mono">{a.membres}</td>
                    <td className="mono">{a.incidents_30j}</td>
                    <td className="mono nowrap">{a.derniere_verif ? `${dateCourte(a.derniere_verif)} ${heure(a.derniere_verif)}` : "—"}</td>
                    <td className="mono nowrap">{dateCourte(a.cree_le)}</td>
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
