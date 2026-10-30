import Link from "next/link";
import { Alerte, Cloche, Coche, Plus } from "@/components/Icones";
import { ETATS, TYPES, dateCourte, duree, heure, ilYA, pourcentage, salutation } from "@/lib/format";

export type Moniteur = {
  id: string; nom: string; type: string; url: string | null; etat: string; etat_depuis: string; derniere_verif: string | null;
  dernier_ms: number | null; seuil_lent_ms: number; ssl_expire_le: string | null; dernier_signal: string | null; client: string | null;
  actif?: boolean; domaine?: string | null; domaine_expire_le?: string | null;
};
export type Incident = {
  id: string; moniteur_id: string; debut: string; confirme_le: string; fin: string | null; cause: string | null;
  lieux: string; vu_le: string | null; vu_par: string | null; derniere_relance: string | null;
};
export type AlerteEnvoyee = { id: string; type: string; canal: string; statut: string; cree_le: string; envoye_le: string | null; moniteur: string };
export type Point = { heure: string; lieu: string; ms: number };

export type DonneesVue = {
  orgNom: string;
  ecriture: boolean;
  maintenant: number;
  rappelMin: number;
  pushActif: boolean;
  moniteurs: Moniteur[];
  incidents: Incident[];
  alertes: AlerteEnvoyee[];
  courbe: Point[];
};

const TRENTE_JOURS = 30 * 86400000;
const TYPES_ALERTE: Record<string, { texte: string; ton: string }> = {
  panne: { texte: "Panne", ton: "rouge" }, rappel: { texte: "Rappel", ton: "rouge" }, escalade: { texte: "Escalade", ton: "rouge" },
  retabli: { texte: "Rétabli", ton: "vert" }, lenteur: { texte: "Lenteur", ton: "ambre" }, ssl: { texte: "Certificat", ton: "ambre" },
};
const STATUT_ENVOI: Record<string, string> = { envoyee: "remis", echec: "échec", a_envoyer: "en attente", envoi: "en cours", ignoree: "annulé" };

function phraseSante(d: DonneesVue, ouverts: Incident[]): { texte: string; classe: string } {
  const lents = d.moniteurs.filter((m) => m.etat === "lent").length;
  const derniere = d.moniteurs.map((m) => m.derniere_verif ?? m.dernier_signal).filter((x): x is string => Boolean(x)).sort().at(-1);
  if (ouverts.length) {
    return { texte: `${ouverts.length} service${ouverts.length > 1 ? "s" : ""} en panne. Vos contacts ont été prévenus.`, classe: "alerte-sante" };
  }
  if (!d.moniteurs.length) return { texte: "Ajoutez une première adresse : la surveillance démarre dans la minute.", classe: "lent-sante" };
  if (!derniere) return { texte: "Première vérification en cours, depuis Abidjan et Paris…", classe: "lent-sante" };
  if (lents) return { texte: `Tout répond, mais ${lents} service${lents > 1 ? "s sont lents" : " est lent"}. Dernière vérification ${ilYA(derniere, d.maintenant)}.`, classe: "lent-sante" };
  return { texte: `Tout fonctionne. Dernière vérification ${ilYA(derniere, d.maintenant)}.`, classe: "" };
}

function Courbe({ points, maintenant }: { points: Point[]; maintenant: number }) {
  // 24 créneaux d'une heure, deux barres par créneau (Abidjan, Paris).
  const debut = Math.floor(maintenant / 3600000) * 3600000 - 23 * 3600000;
  const max = Math.max(500, ...points.map((p) => p.ms));
  const parCreneau = new Map(points.map((p) => [`${new Date(p.heure).getTime()}|${p.lieu}`, p.ms]));
  const barres = Array.from({ length: 24 }, (_, i) => {
    const t = debut + i * 3600000;
    return { i, a: parCreneau.get(`${t}|abidjan`) ?? 0, p: parCreneau.get(`${t}|paris`) ?? 0 };
  });
  const h = (ms: number) => Math.round((ms / max) * 116);
  const moyenne = points.filter((p) => p.lieu === "abidjan");
  const moy = moyenne.length ? Math.round(moyenne.reduce((s, p) => s + p.ms, 0) / moyenne.length) : null;
  return (
    <>
      <svg className="courbe" viewBox="0 0 240 120" preserveAspectRatio="none" role="img"
        aria-label={moy ? `Temps de réponse moyen sur 24 h : ${moy} ms depuis Abidjan` : "Pas encore de mesure sur 24 h"}>
        {barres.map((b) => (
          <g key={b.i}>
            {b.a > 0 && <rect x={b.i * 10 + 1} y={120 - h(b.a)} width="4" height={h(b.a)} rx="1" fill="#22a06b" />}
            {b.p > 0 && <rect x={b.i * 10 + 5} y={120 - h(b.p)} width="4" height={h(b.p)} rx="1" fill="#8a9bbe" />}
          </g>
        ))}
      </svg>
      <div className="axe"><span>{heure(new Date(debut).toISOString())}</span><span>{heure(new Date(debut + 12 * 3600000).toISOString())}</span><span>maintenant</span></div>
    </>
  );
}

export function VueEnsemble({ d, actionVu }: { d: DonneesVue; actionVu?: (form: FormData) => Promise<void> }) {
  const parId = new Map(d.moniteurs.map((m) => [m.id, m]));
  const ouverts = d.incidents.filter((i) => !i.fin);
  const sante = phraseSante(d, ouverts);
  const debut30 = d.maintenant - TRENTE_JOURS;
  const minutesPanne = d.incidents.reduce((s, i) => s + (new Date(i.fin ?? d.maintenant).getTime() - Math.max(new Date(i.debut).getTime(), debut30)), 0) / 60000;
  const dispo = d.moniteurs.length ? 100 - (100 * minutesPanne) / ((TRENTE_JOURS / 60000) * d.moniteurs.length) : null;
  const compte = (e: string) => d.moniteurs.filter((m) => m.etat === e).length;
  const durees = d.incidents.filter((i) => i.fin).map((i) => new Date(i.fin!).getTime() - new Date(i.debut).getTime()).sort((a, b) => a - b);
  const mediane = durees.length ? durees[Math.floor(durees.length / 2)] : null;
  const abidjan = d.courbe.filter((p) => p.lieu === "abidjan");
  const moyenne = abidjan.length ? Math.round(abidjan.reduce((s, p) => s + p.ms, 0) / abidjan.length) : null;
  const ssl = d.moniteurs.filter((m) => m.ssl_expire_le && new Date(m.ssl_expire_le).getTime() - d.maintenant < TRENTE_JOURS);
  const domaines = d.moniteurs.filter((m, i, tous) => m.domaine_expire_le && new Date(m.domaine_expire_le).getTime() - d.maintenant < TRENTE_JOURS
    && tous.findIndex((x) => x.domaine === m.domaine) === i);
  const premiersPas = [
    { fait: true, titre: "Créer votre organisation", texte: "C'est fait." },
    { fait: d.moniteurs.length > 0, titre: "Ajouter votre première adresse", texte: "Un site, une API ou votre page de paiement.", lien: "/moniteurs/nouveau", action: "Ajouter" },
    { fait: d.pushActif, titre: "Recevoir les alertes sur ce téléphone", texte: "Sans notification, vous ne serez prévenu que par email.", lien: "/alertes", action: "Activer" },
  ];
  const restants = premiersPas.filter((p) => !p.fait).length;

  return (
    <>
      <div className="entete salut">
        <div>
          <h1>{salutation(new Date(d.maintenant))}</h1>
          <p className={`sante ${sante.classe}`} role="status">{sante.texte}</p>
        </div>
        {d.ecriture && d.moniteurs.length > 0 && <Link className="bouton" href="/moniteurs/nouveau"><Plus taille={16} />Ajouter un moniteur</Link>}
      </div>

      {restants > 0 && d.ecriture && (
        <section className="premiers-pas" aria-labelledby="titre-premiers-pas">
          <h2 id="titre-premiers-pas">Encore {restants} étape{restants > 1 ? "s" : ""} pour être prévenu à temps</h2>
          <p className="doux">Comptez deux minutes. Ensuite, AlerteRobot veille à votre place, jour et nuit.</p>
          <ol>
            {premiersPas.map((p, i) => (
              <li key={p.titre} className={p.fait ? "fait" : undefined}>
                <span className="rond" aria-hidden="true">{p.fait ? <Coche taille={14} /> : i + 1}</span>
                <div className="quoi"><strong>{p.titre}</strong><p>{p.fait ? "Fait." : p.texte}</p></div>
                {!p.fait && p.lien && <Link className="bouton secondaire" href={p.lien}>{p.action}</Link>}
                {p.fait && <span className="masque">Étape terminée</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {ouverts.map((i) => {
        const m = parId.get(i.moniteur_id);
        const prochainRappel = i.derniere_relance ? new Date(new Date(i.derniere_relance).getTime() + d.rappelMin * 60000).toISOString() : null;
        return (
          <section key={i.id} className={`banniere${i.vu_le ? " vue" : ""}`} aria-label={`Incident en cours : ${m?.nom ?? "moniteur"}`}>
            <span className="ico" aria-hidden="true">{i.vu_le ? <Coche taille={20} /> : <Alerte taille={20} />}</span>
            <div>
              <h2>{m?.nom ?? "Un moniteur"} est en panne{m?.client ? ` · ${m.client}` : ""}</h2>
              <p>
                {i.vu_le
                  ? `Pris en charge par ${i.vu_par ?? "un membre"} à ${heure(i.vu_le)}. Les rappels sont arrêtés ; le message de rétablissement partira tout seul.`
                  : `Ne répond plus depuis ${heure(i.debut)}, soit ${duree(d.maintenant - new Date(i.debut).getTime())}. ${i.cause ? `${i.cause}.` : ""}${i.lieux.includes(",") ? " Confirmé depuis Abidjan et Paris." : ""}`}
              </p>
              {!i.vu_le && (
                <ul className="jalons">
                  <li><span className="mono">{heure(i.confirme_le)}</span>alerte envoyée</li>
                  {prochainRappel && <li><span className="mono">{heure(prochainRappel)}</span>prochain rappel si personne ne répond</li>}
                </ul>
              )}
            </div>
            <div className="actions">
              {!i.vu_le && d.ecriture && (
                actionVu ? (
                  <form action={actionVu}>
                    <input type="hidden" name="incident" value={i.id} />
                    <button type="submit" className="bouton secondaire">J&apos;ai vu</button>
                  </form>
                ) : <button type="button" className="bouton secondaire" disabled>J&apos;ai vu</button>
              )}
              <Link className="bouton danger" href={`/incidents/${i.id}`}>Voir l&apos;incident</Link>
            </div>
          </section>
        );
      })}

      {d.moniteurs.length > 0 && (
        <div className="grille-kpi">
          <div className="carte">
            <p className="pale">Disponibilité · 30 jours</p>
            <p className="kpi-valeur">{dispo !== null ? pourcentage(Math.max(0, dispo)) : "—"}</p>
            <p className="pale">{minutesPanne >= 1 ? `${duree(minutesPanne * 60000)} de panne au total` : "aucune panne ce mois-ci"}</p>
          </div>
          <div className="carte">
            <p className="pale">Moniteurs</p>
            <p className="kpi-valeur">{d.moniteurs.length}</p>
            <p className="pale"><span className="vert-txt">{compte("ok")} en ligne</span>{compte("lent") > 0 && <> · <span className="ambre-txt">{compte("lent")} lent{compte("lent") > 1 ? "s" : ""}</span></>}{compte("panne") > 0 && <> · <span className="rouge-txt">{compte("panne")} en panne</span></>}</p>
          </div>
          <div className="carte">
            <p className="pale">Temps de réponse moyen</p>
            <p className="kpi-valeur">{moyenne !== null ? `${moyenne} ms` : "—"}</p>
            <p className="pale">depuis Abidjan · 24 h</p>
          </div>
          <div className="carte">
            <p className="pale">Incidents · 30 jours</p>
            <p className="kpi-valeur">{d.incidents.length}</p>
            <p className="pale">{mediane !== null ? `durée médiane ${duree(mediane)}` : "rien à signaler"}</p>
          </div>
        </div>
      )}

      <div className="deux-colonnes">
        <section className="carte principale" aria-labelledby="titre-moniteurs">
          <div className="carte-tete"><h2 id="titre-moniteurs">Moniteurs</h2>{d.moniteurs.length > 0 && <span className="pale">vérifiés toutes les 1 à 5 min</span>}</div>
          {d.moniteurs.length === 0 ? (
            <div className="vide">
              <strong>Rien à surveiller pour l&apos;instant</strong>
              <p>Collez l&apos;adresse de votre site, de votre API ou de votre page de paiement. La première vérification part dans la minute.</p>
              {d.ecriture && <Link className="bouton" href="/moniteurs/nouveau"><Plus taille={16} />Ajouter ma première adresse</Link>}
            </div>
          ) : (
            <div className="table-boite">
              <table>
                <thead><tr><th scope="col">Moniteur</th><th scope="col">Client</th><th scope="col">Type</th><th scope="col">État</th><th scope="col" className="droite">Réponse</th></tr></thead>
                <tbody>
                  {d.moniteurs.map((m) => {
                    const sslProche = m.ssl_expire_le && new Date(m.ssl_expire_le).getTime() - d.maintenant < TRENTE_JOURS;
                    const verif = m.derniere_verif ?? m.dernier_signal;
                    const pause = m.actif === false;
                    return (
                      <tr key={m.id} className={m.etat === "panne" && !pause ? "en-panne" : undefined}>
                        <td className="col-moniteur"><Link className="lien-ligne" href={`/moniteurs/${m.id}`}>{m.nom}</Link><span className="pale">{m.url ?? (m.dernier_signal ? `dernier signal ${ilYA(m.dernier_signal, d.maintenant)}` : "en attente du premier signal")}</span></td>
                        <td className="nowrap">{m.client ?? "—"}</td>
                        <td className="nowrap">{TYPES[m.type] ?? m.type}</td>
                        <td>
                          <span className={`etat etat-${pause ? "inconnu" : m.etat}`}>{pause ? "En pause" : ETATS[m.etat] ?? m.etat}</span>
                          <span className="pale">
                            {pause ? "aucune vérification" : m.etat === "panne" || m.etat === "lent" ? `depuis ${duree(d.maintenant - new Date(m.etat_depuis).getTime())}` : verif ? `vérifié ${ilYA(verif, d.maintenant)}` : "jamais vérifié"}
                            {sslProche && m.ssl_expire_le ? ` · SSL expire le ${dateCourte(m.ssl_expire_le)}` : ""}
                          </span>
                        </td>
                        <td className={`mono nowrap droite ${m.dernier_ms !== null && m.dernier_ms > m.seuil_lent_ms ? "ambre-txt" : ""}`}>
                          {m.etat === "panne" || m.dernier_ms === null ? "—" : m.dernier_ms >= 1000 ? `${(m.dernier_ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s` : `${m.dernier_ms} ms`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="laterale">
          {d.moniteurs.length > 0 && (
            <section className="carte" aria-labelledby="titre-courbe">
              <div className="carte-tete"><h2 id="titre-courbe">Temps de réponse</h2><span className="pale">24 h</span></div>
              <div className="legende"><span><i />Abidjan</span><span><i className="paris" />Paris</span></div>
              <Courbe points={d.courbe} maintenant={d.maintenant} />
            </section>
          )}

          <section className="carte" aria-labelledby="titre-prevoir">
            <h2 id="titre-prevoir" className="carte-tete">À prévoir</h2>
            {ssl.length + domaines.length === 0 ? <p className="pale">Rien à signaler pour les 30 prochains jours.</p> : (
              <ul className="liste-points">
                {domaines.map((m) => (
                  <li key={`d-${m.id}`} className="rouge"><div><strong>Nom de domaine · {m.domaine}</strong><p className="pale">Expire le {dateCourte(m.domaine_expire_le!)} : renouvelez-le chez votre registraire.</p></div></li>
                ))}
                {ssl.map((m) => (
                  <li key={m.id} className="ambre"><div><strong>Certificat · {m.nom}</strong><p className="pale">Expire le {dateCourte(m.ssl_expire_le!)} : pensez au renouvellement.</p></div></li>
                ))}
              </ul>
            )}
          </section>

          <section className="carte" aria-labelledby="titre-alertes">
            <h2 id="titre-alertes" className="carte-tete">Dernières alertes</h2>
            {d.alertes.length === 0 ? (
              <p className="pale">Aucune alerte envoyée. {d.pushActif ? "" : <Link href="/alertes">Activez les notifications</Link>}</p>
            ) : (
              <ul className="liste-points">
                {d.alertes.map((a) => {
                  const t = TYPES_ALERTE[a.type] ?? { texte: a.type, ton: "gris" };
                  return (
                    <li key={a.id} className={t.ton}>
                      <div>
                        <strong>{t.texte}</strong> · {a.moniteur}
                        <p className="pale">{heure(a.envoye_le ?? a.cree_le)} · {a.canal === "push" ? <><Cloche taille={12} /> push</> : "email"} {STATUT_ENVOI[a.statut] ?? a.statut}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
