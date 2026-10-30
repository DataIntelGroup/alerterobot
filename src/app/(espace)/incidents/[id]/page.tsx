import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { espace, peutEcrire } from "@/lib/session";
import { dateCourte, duree, heure } from "@/lib/format";
import { accuserReception } from "../../actions";
import { FormulaireMaj } from "./FormulaireMaj";

export const metadata: Metadata = { title: "Incident" };

const ETAPES: Record<string, string> = { analyse: "En cours d'analyse", identifie: "Cause identifiée", surveillance: "Sous surveillance", resolu: "Résolu" };
const TYPES: Record<string, string> = { panne: "Alerte de panne", rappel: "Rappel", escalade: "Escalade", retabli: "Rétablissement", lenteur: "Lenteur", ssl: "Certificat" };
const STATUTS: Record<string, string> = { a_envoyer: "en attente", envoi: "en cours", envoyee: "remis", echec: "échec", ignoree: "annulé (déjà vu)" };
const LIEUX: Record<string, string> = { abidjan: "Abidjan", paris: "Paris" };

type Details = { ip?: string; dns_ms?: number; ttfb_ms?: number; redirections?: number; extrait?: string; type_contenu?: string };

export default async function PageIncident({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, org } = await espace();
  // La RLS ne renvoie l'incident que s'il appartient à une organisation du visiteur.
  const { data: i } = await supabase.from("incidents")
    .select("id, moniteur_id, debut, confirme_le, fin, cause, lieux, vu_le, vu_par, moniteurs (nom, url, public)")
    .eq("id", id).maybeSingle();
  if (!i) notFound();
  const m = i.moniteurs as unknown as { nom: string; url: string | null; public: boolean };
  const avant = new Date(new Date(i.debut).getTime() - 10 * 60000).toISOString();
  const [{ data: maj }, { data: envois }, { data: sondes }] = await Promise.all([
    supabase.from("incident_maj").select("id, etape, message, publique, auteur, cree_le").eq("incident_id", id).order("cree_le", { ascending: false }),
    supabase.from("notifications").select("id, canal, type, statut, envoye_le, cree_le, contacts (nom)").eq("incident_id", id).order("cree_le"),
    supabase.from("verifications").select("id, lieu, le, code, ms, erreur, details").eq("moniteur_id", i.moniteur_id).eq("ok", false)
      .gte("le", avant).lte("le", i.fin ?? new Date().toISOString()).order("le", { ascending: false }).limit(6),
  ]);
  const fin = i.fin ? new Date(i.fin).getTime() : Date.now();
  const ecriture = peutEcrire(org.role);
  const derniere = maj?.[0]?.etape;
  const etapeConseillee = i.fin ? "resolu" : derniere === "analyse" ? "identifie" : derniere === "identifie" ? "surveillance" : "identifie";

  return (
    <div className="etroit pile">
      <Link className="retour" href="/tableau-de-bord">← Vue d&apos;ensemble</Link>
      <div className="entete">
        <div>
          <p className={`etat ${i.fin ? "etat-ok" : "etat-panne"}`}>{i.fin ? "Résolu" : "En cours"}</p>
          <h1>{m.nom}</h1>
          <p className="pale">
            {dateCourte(i.debut)}, {heure(i.debut)}{i.fin ? ` – ${heure(i.fin)}` : ""} · {duree(fin - new Date(i.debut).getTime())}
            {i.lieux !== "heartbeat" && ` · confirmé depuis ${i.lieux.split(",").map((l: string) => LIEUX[l] ?? l).join(" et ")}`}
          </p>
        </div>
        {!i.fin && !i.vu_le && ecriture && (
          <form action={accuserReception}>
            <input type="hidden" name="incident" value={i.id} />
            <button type="submit" className="bouton">J&apos;ai vu, je m&apos;en occupe</button>
          </form>
        )}
      </div>
      {i.vu_le && <p className="alerte info">Pris en charge par {i.vu_par ?? "un membre"} à {heure(i.vu_le)}. Les rappels sont arrêtés.</p>}

      <section className="carte pile" aria-labelledby="titre-sondes">
        <div>
          <h2 id="titre-sondes">Ce que nos sondes ont vu</h2>
          <p className="pale">Cause retenue : {i.cause ?? "inconnue"}{m.url ? ` · ${m.url}` : ""}</p>
        </div>
        {(sondes ?? []).length === 0 ? <p className="pale">Pas de détail technique pour cet incident.</p> : (
          <ul className="sondes">
            {(sondes ?? []).map((s) => {
              const d = (s.details ?? {}) as Details;
              return (
                <li key={s.id}>
                  <div className="sonde-tete"><strong>{LIEUX[s.lieu] ?? s.lieu}</strong><span className="mono pale">{heure(s.le)}</span></div>
                  <p>{s.erreur ?? "Échec"}{s.code ? ` · code ${s.code}` : ""}</p>
                  <dl className="mesures">
                    {d.ip && <><dt>Adresse contactée</dt><dd className="code">{d.ip}</dd></>}
                    {d.dns_ms !== undefined && <><dt>Résolution DNS</dt><dd className="mono">{d.dns_ms} ms</dd></>}
                    {d.ttfb_ms !== undefined && <><dt>Première réponse</dt><dd className="mono">{d.ttfb_ms} ms</dd></>}
                    {d.redirections !== undefined && <><dt>Redirections</dt><dd className="mono">{d.redirections}</dd></>}
                    {d.type_contenu && <><dt>Type de contenu</dt><dd className="code">{d.type_contenu}</dd></>}
                  </dl>
                  {d.extrait && <><p className="pale">Début de la page reçue :</p><pre className="extrait">{d.extrait}</pre></>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="carte pile" aria-labelledby="titre-chronologie">
        <div>
          <h2 id="titre-chronologie">Chronologie</h2>
          <p className="pale">{m.public ? "Les étapes publiques s'affichent sur la page de statut de votre client." : "Ce service n'est sur aucune page de statut : la chronologie reste interne."}</p>
        </div>
        {ecriture && <FormulaireMaj incident={i.id} etapeConseillee={etapeConseillee} />}
        <ol className="chronologie">
          {(maj ?? []).map((u) => (
            <li key={u.id} className={u.etape === "resolu" ? "vert" : u.etape === "analyse" ? "rouge" : "ambre"}>
              <div>
                <strong>{ETAPES[u.etape] ?? u.etape}</strong>
                <span className="pale"> · {dateCourte(u.cree_le)} {heure(u.cree_le)} · {u.auteur}{u.publique ? "" : " · interne"}</span>
                <p>{u.message}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="carte" aria-labelledby="titre-envois">
        <h2 id="titre-envois" className="carte-tete">Alertes envoyées à l&apos;équipe</h2>
        {(envois ?? []).length === 0 ? <p className="pale">Aucune alerte envoyée pour cet incident.</p> : (
          <div className="table-boite">
            <table>
              <thead><tr><th scope="col">Heure</th><th scope="col">Alerte</th><th scope="col">Canal</th><th scope="col">Pour</th><th scope="col">Statut</th></tr></thead>
              <tbody>
                {(envois ?? []).map((n) => (
                  <tr key={n.id}>
                    <td className="mono">{heure(n.envoye_le ?? n.cree_le)}</td>
                    <td>{TYPES[n.type] ?? n.type}</td>
                    <td>{n.canal === "push" ? "Notification" : "Email"}</td>
                    <td>{(n.contacts as unknown as { nom: string } | null)?.nom ?? "—"}</td>
                    <td>{STATUTS[n.statut] ?? n.statut}</td>
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
