import type { Metadata } from "next";
import Link from "next/link";
import { espace } from "@/lib/session";
import { afficherSurPage } from "../actions";
import { FormulairePage } from "./FormulairePage";

export const metadata: Metadata = { title: "Pages de statut" };

type Page = { client_id: string; nom: string; slug: string | null; abonnes: number; services: number };
type Moniteur = { id: string; nom: string; client_id: string | null; public: boolean };

export default async function PagesStatut() {
  const { supabase, org } = await espace();
  const [{ data: pages }, { data: moniteurs }] = await Promise.all([
    supabase.rpc("pages_statut", { p_org: org.id }),
    supabase.from("moniteurs").select("id, nom, client_id, public").eq("org_id", org.id).order("nom"),
  ]);
  const liste = ((pages ?? []) as Page[]).filter((p) => p.slug);
  const tous = (moniteurs ?? []) as Moniteur[];
  const gerer = org.role === "proprietaire" || org.role === "admin";
  const appUrl = (process.env.APP_URL ?? "http://localhost:3500").replace(/\/$/, "");

  return (
    <div className="etroit pile">
      <div>
        <h1>Pages de statut</h1>
        <p className="doux">Une page publique par client, comme celle des grandes plateformes. Vos clients y voient si tout fonctionne, l&apos;historique des incidents et vos mises à jour, et peuvent s&apos;abonner par email. Les adresses techniques et les causes détaillées n&apos;y apparaissent jamais.</p>
      </div>

      {liste.map((p) => {
        const affiches = tous.filter((m) => m.public && m.client_id === p.client_id);
        const autres = tous.filter((m) => !(m.public && m.client_id === p.client_id));
        return (
          <section key={p.client_id} className="carte pile" aria-label={`Page de ${p.nom}`}>
            <div className="carte-tete">
              <div><h2>{p.nom}</h2><p className="pale code">/statut/{p.slug}</p></div>
              <Link className="bouton secondaire" href={`/statut/${p.slug}`} target="_blank" rel="noopener">Voir la page</Link>
            </div>
            <p className="pale">{p.abonnes} abonné{p.abonnes > 1 ? "s" : ""} confirmé{p.abonnes > 1 ? "s" : ""} · {affiches.length} service{affiches.length > 1 ? "s" : ""} affiché{affiches.length > 1 ? "s" : ""}</p>
            <ul className="liste-bascule">
              {affiches.map((m) => (
                <li key={m.id}>
                  <span className="etat etat-ok">{m.nom}</span>
                  {gerer && (
                    <form action={afficherSurPage}>
                      <input type="hidden" name="moniteur" value={m.id} /><input type="hidden" name="client" value={p.client_id} />
                      <button type="submit" className="lien-bouton">Retirer</button>
                    </form>
                  )}
                </li>
              ))}
              {gerer && autres.map((m) => (
                <li key={m.id}>
                  <span className="etat etat-inconnu">{m.nom}</span>
                  <form action={afficherSurPage}>
                    <input type="hidden" name="moniteur" value={m.id} /><input type="hidden" name="client" value={p.client_id} />
                    <input type="hidden" name="visible" value="oui" />
                    <button type="submit" className="lien-bouton">Afficher</button>
                  </form>
                </li>
              ))}
            </ul>
            {tous.length === 0 && <p className="pale">Ajoutez d&apos;abord un moniteur pour l&apos;afficher ici.</p>}
          </section>
        );
      })}

      {gerer ? (
        <section className="carte" aria-labelledby="titre-nouvelle-page">
          <h2 id="titre-nouvelle-page" className="carte-tete">{liste.length ? "Ajouter une page pour un autre client" : "Créer votre première page"}</h2>
          <FormulairePage appUrl={appUrl} />
        </section>
      ) : liste.length === 0 && <p className="pale">Aucune page pour l&apos;instant. Un administrateur de l&apos;organisation peut en créer une.</p>}
    </div>
  );
}
