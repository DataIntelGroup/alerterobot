import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { espace, peutEcrire } from "@/lib/session";
import { dateCourte, duree, heure } from "@/lib/format";
import { lieuxConfirmes, titrePanne, titreResolu } from "@/lib/phrases";
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
    .select("id, moniteur_id, debut, confirme_le, fin, cause, lieux, vu_le, vu_par, moniteurs (nom, url, public, type)")
    .eq("id", id).maybeSingle();
  if (!i) notFound();
  const m = i.moniteurs as unknown as { nom: string; url: string | null; public: boolean; type: string };
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
      <Link className="retour" href="/tableau-de-bord">← Aujourd&apos;hui</Link>
      <article className={`panne-carte${i.fin ? " resolu" : i.vu_le ? " vue" : ""}`}>
        <span className="panne-pastille">
          <i aria-hidden="true" />
          {i.fin ? `Réparé en ${duree(fin - new Date(i.debut).getTime())}` : i.vu_le ? `Pris en charge par ${i.vu_par ?? "un membre"}` : `En panne depuis ${duree(fin - new Date(i.debut).getTime())}`}
        </span>
        <h1>{i.fin ? titreResolu(m.type, m.nom) : titrePanne(m.type, m.nom)}</h1>
        <p>{lieuxConfirmes(i.lieux) ?? "Le signal attendu n'est pas arrivé à temps."}{i.cause ? ` Ce que nous avons reçu : ${i.cause.toLowerCase()}.` : ""}</p>
        <dl className="panne-faits">
          <div><dt>Début</dt><dd>{dateCourte(i.debut)}, {heure(i.debut)}</dd></div>
          <div><dt>Alerte envoyée</dt><dd>{heure(i.confirme_le)}</dd></div>
          {i.vu_le && <div><dt>Pris en charge</dt><dd>{heure(i.vu_le)} par {i.vu_par ?? "un membre"}</dd></div>}
          {i.fin && <div><dt>Réparé</dt><dd>{heure(i.fin)}</dd></div>}
        </dl>
        <div className="panne-actions">
          {!i.fin && !i.vu_le && ecriture && (
            <form action={accuserReception}>
              <input type="hidden" name="incident" value={i.id} />
              <button type="submit" className="bouton">Je m&apos;en occupe</button>
            </form>
          )}
          {ecriture && !i.fin && <a className="bouton secondaire" href="#informer">Prévenir mes clients</a>}
        </div>
      </article>

      <details className="repli carte">
        <summary>
          <span><strong>Voir ce qu&apos;on a mesuré</strong><span className="pale">{(sondes ?? []).length} mesure{(sondes ?? []).length > 1 ? "s" : ""} en échec{m.url ? ` · ${m.url}` : ""}</span></span>
        </summary>
        <div className="pile">
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
        </div>
      </details>

      <section id="informer" className="carte pile" aria-labelledby="titre-chronologie">
        <div>
          <h2 id="titre-chronologie">Tenir vos clients informés</h2>
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

      <details className="repli carte">
        <summary><span><strong>Qui a été prévenu</strong><span className="pale">{(envois ?? []).length} alerte{(envois ?? []).length > 1 ? "s" : ""} envoyée{(envois ?? []).length > 1 ? "s" : ""} à l&apos;équipe</span></span></summary>
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
      </details>
    </div>
  );
}
