import Link from "next/link";
import { Alerte, Coche, Plus } from "@/components/Icones";
import { dateCourte, duree, heure, ilYA, jourLong, salutation } from "@/lib/format";
import { lieuxConfirmes, rapidite, titrePanne, titreResolu } from "@/lib/phrases";

export type Moniteur = {
  id: string; nom: string; type: string; url: string | null; etat: string; etat_depuis: string; derniere_verif: string | null;
  dernier_ms: number | null; seuil_lent_ms: number; ssl_expire_le: string | null; dernier_signal: string | null; client: string | null;
  actif?: boolean; domaine?: string | null; domaine_expire_le?: string | null;
};
export type Incident = {
  id: string; moniteur_id: string; debut: string; confirme_le: string; fin: string | null; cause: string | null;
  lieux: string; vu_le: string | null; vu_par: string | null; derniere_relance: string | null;
};
export type AlerteEnvoyee = { id: string; type: string; canal: string; statut: string; cree_le: string; envoye_le: string | null; moniteur: string; moniteur_type?: string };

export type DonneesVue = {
  orgNom: string;
  ecriture: boolean;
  maintenant: number;
  rappelMin: number;
  pushActif: boolean;
  moniteurs: Moniteur[];
  incidents: Incident[];
  alertes: AlerteEnvoyee[];
};

const TRENTE_JOURS = 30 * 86400000;
const MAX_LISTE = 6;

/** La grande phrase du haut : ce qu'il faut savoir en une lecture. */
function titreDuJour(d: DonneesVue, ouverts: Incident[]): { titre: string; sous: string } {
  const actifs = d.moniteurs.filter((m) => m.actif !== false);
  const lents = actifs.filter((m) => m.etat === "lent");
  const derniere = actifs.map((m) => m.derniere_verif ?? m.dernier_signal).filter((x): x is string => Boolean(x)).sort().at(-1);
  const suivi = `${actifs.length} service${actifs.length > 1 ? "s" : ""} surveillé${actifs.length > 1 ? "s" : ""} depuis Abidjan et Paris`;
  const sous = derniere ? `${suivi} · dernière vérification ${ilYA(derniere, d.maintenant)}` : suivi;
  const nonVus = ouverts.filter((i) => !i.vu_le);
  if (!d.moniteurs.length) return { titre: "Bienvenue. Commençons par votre premier service.", sous: "Collez l'adresse d'un site, d'une API ou d'une page de paiement : la surveillance démarre dans la minute." };
  if (nonVus.length === 1) return { titre: `Une chose demande votre attention.${actifs.length > 1 ? " Le reste fonctionne." : ""}`, sous };
  if (nonVus.length > 1) return { titre: `${nonVus.length} services demandent votre attention.`, sous };
  if (ouverts.length) return { titre: "La panne est prise en charge. Nous vous prévenons dès que c'est réparé.", sous };
  if (!derniere) return { titre: "Première vérification en cours…", sous: "Les résultats arrivent dans une minute environ." };
  if (lents.length === 1) return { titre: `Tout répond, mais ${lents[0].nom} est lent.`, sous };
  if (lents.length > 1) return { titre: `Tout répond, mais ${lents.length} services sont lents.`, sous };
  return { titre: "Tout fonctionne. Vous pouvez souffler.", sous };
}

/** Les dernières alertes, une phrase par événement (l'email et la notification d'un même événement ne comptent qu'une fois). */
function nouvelles(alertes: AlerteEnvoyee[]) {
  const vues = new Map<string, { quand: string; texte: string; ton: string; canaux: Set<string> }>();
  for (const a of alertes) {
    const quand = a.envoye_le ?? a.cree_le;
    const cle = `${a.type}|${a.moniteur}|${quand.slice(0, 16)}`;
    const deja = vues.get(cle);
    if (deja) { deja.canaux.add(a.canal); continue; }
    const type = a.moniteur_type ?? "http";
    const phrase: Record<string, [string, string]> = {
      panne: [`${titrePanne(type, a.moniteur)}.`, "rouge"],
      rappel: [`Rappel : ${a.moniteur} est toujours en panne.`, "rouge"],
      escalade: [`Personne n'avait répondu : la personne suivante a été prévenue pour ${a.moniteur}.`, "rouge"],
      retabli: [`${titreResolu(type, a.moniteur)}.`, "vert"],
      lenteur: [`${a.moniteur} répond lentement.`, "ambre"],
      ssl: [`Le certificat de ${a.moniteur} expire bientôt.`, "ambre"],
      domaine: [`Le nom de domaine de ${a.moniteur} expire bientôt.`, "ambre"],
    };
    const [texte, ton] = phrase[a.type] ?? [`${a.moniteur} : ${a.type}.`, "gris"];
    vues.set(cle, { quand, texte, ton, canaux: new Set([a.canal]) });
  }
  return [...vues.values()].slice(0, 6);
}

function etatCourt(m: Moniteur, maintenant: number): { texte: string; ton: string } {
  if (m.actif === false) return { texte: "En pause, aucune vérification", ton: "gris" };
  if (m.etat === "lent" && m.dernier_ms !== null) return { texte: `Lent : ${rapidite(m.dernier_ms)} au lieu de moins de ${rapidite(m.seuil_lent_ms)}`, ton: "ambre" };
  if (m.etat === "suspect") return { texte: "Vérification en cours depuis un second lieu…", ton: "ambre" };
  if (m.etat === "inconnu") return { texte: "Première vérification en cours", ton: "gris" };
  if (m.type === "heartbeat") return { texte: m.dernier_signal ? `Dernier signal ${ilYA(m.dernier_signal, maintenant)}` : "En attente du premier signal", ton: "vert" };
  return { texte: m.dernier_ms !== null ? `Répond en ${rapidite(m.dernier_ms)}` : "Répond normalement", ton: "vert" };
}

export function VueEnsemble({ d, actionVu }: { d: DonneesVue; actionVu?: (form: FormData) => Promise<void> }) {
  const parId = new Map(d.moniteurs.map((m) => [m.id, m]));
  const ouverts = d.incidents.filter((i) => !i.fin);
  const enPanne = new Set(ouverts.map((i) => i.moniteur_id));
  const { titre, sous } = titreDuJour(d, ouverts);
  const reste = d.moniteurs.filter((m) => !enPanne.has(m.id));
  const tousBien = reste.every((m) => m.actif === false || m.etat === "ok");
  const ssl = d.moniteurs.filter((m) => m.ssl_expire_le && new Date(m.ssl_expire_le).getTime() - d.maintenant < TRENTE_JOURS);
  const domaines = d.moniteurs.filter((m, i, tous) => m.domaine_expire_le && new Date(m.domaine_expire_le).getTime() - d.maintenant < TRENTE_JOURS
    && tous.findIndex((x) => x.domaine === m.domaine) === i);
  const fil = nouvelles(d.alertes);
  const premiersPas = [
    { fait: true, titre: "Créer votre organisation", texte: "C'est fait." },
    { fait: d.moniteurs.length > 0, titre: "Ajouter votre premier service", texte: "Un site, une API ou votre page de paiement.", lien: "/moniteurs/nouveau", action: "Ajouter" },
    { fait: d.pushActif, titre: "Recevoir les alertes sur ce téléphone", texte: "Sans notification, vous ne serez prévenu que par email.", lien: "/alertes", action: "Activer" },
  ];
  const restants = premiersPas.filter((p) => !p.fait).length;

  return (
    <div className="aujourdhui">
      <div className="jour-tete">
        <div>
          <p className="jour-date">{salutation(new Date(d.maintenant))} · {jourLong(new Date(d.maintenant))}, {heure(new Date(d.maintenant).toISOString())}</p>
          <h1 className="jour-titre">{titre}</h1>
          <p className="jour-sous" role="status">{sous}</p>
        </div>
        {d.ecriture && d.moniteurs.length > 0 && <Link className="bouton secondaire" href="/moniteurs/nouveau"><Plus taille={16} />Surveiller un service</Link>}
      </div>

      <div className="jour-grille">
        <div className="jour-principal">
          {restants > 0 && d.ecriture && (
            <section className="premiers-pas" aria-labelledby="titre-premiers-pas">
              <h2 id="titre-premiers-pas">Encore {restants} étape{restants > 1 ? "s" : ""} pour être prévenu à temps</h2>
              <p className="doux">Comptez deux minutes. Ensuite, AlerteRobot veille à votre place, jour et nuit.</p>
              <ol>
                {premiersPas.map((p, i) => (
                  <li key={p.titre} className={p.fait ? "fait" : undefined}>
                    <span className="rond" aria-hidden="true">{p.fait ? <Coche taille={14} /> : i + 1}</span>
                    <div className="quoi"><strong>{p.titre}</strong><p>{p.fait ? "Fait." : p.texte}</p></div>
                    {!p.fait && p.lien && <Link className="bouton" href={p.lien}>{p.action}</Link>}
                    {p.fait && <span className="masque">Étape terminée</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {ouverts.map((i) => {
            const m = parId.get(i.moniteur_id);
            const nom = m?.nom ?? "Un service";
            const prochainRappel = i.derniere_relance ? new Date(new Date(i.derniere_relance).getTime() + d.rappelMin * 60000).toISOString() : null;
            const lieux = lieuxConfirmes(i.lieux);
            return (
              <article key={i.id} className={`panne-carte${i.vu_le ? " vue" : ""}`} aria-label={`Incident en cours : ${nom}`}>
                <span className="panne-pastille">
                  <i aria-hidden="true" />{i.vu_le ? `Pris en charge par ${i.vu_par ?? "un membre"}` : `En panne depuis ${duree(d.maintenant - new Date(i.debut).getTime())}`}
                </span>
                <h2>{titrePanne(m?.type ?? "http", nom)}</h2>
                <p>
                  {m?.client ? `${m.client}. ` : ""}{lieux ? `${lieux} ` : ""}{i.cause ? `Ce que nous avons reçu : ${i.cause.toLowerCase()}.` : ""}
                </p>
                <dl className="panne-faits">
                  <div><dt>Début</dt><dd>{heure(i.debut)}</dd></div>
                  <div><dt>Alerte envoyée</dt><dd>{heure(i.confirme_le)}</dd></div>
                  {i.vu_le
                    ? <div><dt>Pris en charge</dt><dd>{heure(i.vu_le)}, rappels arrêtés</dd></div>
                    : prochainRappel && <div><dt>Sans réponse</dt><dd>nouveau rappel à {heure(prochainRappel)}</dd></div>}
                </dl>
                <div className="panne-actions">
                  {!i.vu_le && d.ecriture && (
                    actionVu ? (
                      <form action={actionVu}>
                        <input type="hidden" name="incident" value={i.id} />
                        <button type="submit" className="bouton">Je m&apos;en occupe</button>
                      </form>
                    ) : <button type="button" className="bouton" disabled>Je m&apos;en occupe</button>
                  )}
                  {d.ecriture && <Link className="bouton secondaire" href={`/incidents/${i.id}#informer`}>Prévenir mes clients</Link>}
                  <Link className="bouton secondaire" href={`/incidents/${i.id}`}>Voir le détail</Link>
                </div>
              </article>
            );
          })}

          {d.moniteurs.length > 0 && (
            <section className="fil" aria-labelledby="titre-fil">
              <h2 id="titre-fil">Dernières nouvelles</h2>
              {fil.length === 0 ? <p className="pale">Rien à signaler pour l&apos;instant. Nous vous écrirons au moindre souci.</p> : (
                <ol>
                  {fil.map((n) => (
                    <li key={`${n.quand}${n.texte}`} className={n.ton}>
                      <time dateTime={n.quand}>{new Date(d.maintenant).toDateString() === new Date(n.quand).toDateString() ? heure(n.quand) : dateCourte(n.quand)}</time>
                      <p>{n.texte} <span className="pale">Prévenu par {[...n.canaux].map((c) => c === "push" ? "notification" : c === "email" ? "email" : c).join(" et ")}.</span></p>
                    </li>
                  ))}
                </ol>
              )}
              {!d.pushActif && <p className="pale">Les notifications ne sont pas activées sur cet appareil. <Link href="/alertes">Les activer</Link></p>}
            </section>
          )}

          {d.moniteurs.length === 0 && d.ecriture && (
            <section className="vide-accueil">
              <strong>Rien à surveiller pour l&apos;instant</strong>
              <p>Collez l&apos;adresse de votre site, de votre API ou de votre page de paiement. La première vérification part dans la minute.</p>
              <Link className="bouton" href="/moniteurs/nouveau"><Plus taille={16} />Ajouter mon premier service</Link>
            </section>
          )}
        </div>

        {d.moniteurs.length > 0 && (
          <aside className="jour-cote">
            <section className="bloc-doux" aria-labelledby="titre-reste">
              <h2 id="titre-reste">{ouverts.length ? (tousBien ? "Le reste va bien" : "Vos autres services") : "Vos services"}</h2>
              <p className="pale">{reste.length} service{reste.length > 1 ? "s" : ""} vérifié{reste.length > 1 ? "s" : ""} toutes les 1 à 5 min</p>
              <ul className="services-courts">
                {reste.slice(0, MAX_LISTE).map((m) => {
                  const e = etatCourt(m, d.maintenant);
                  return (
                    <li key={m.id} className={e.ton}>
                      <span className="ico" aria-hidden="true">{e.ton === "vert" ? <Coche taille={14} /> : e.ton === "ambre" ? <Alerte taille={14} /> : "–"}</span>
                      <Link href={`/moniteurs/${m.id}`}><strong>{m.nom}</strong><span>{e.texte}</span></Link>
                    </li>
                  );
                })}
              </ul>
              <Link className="lien-suite" href="/moniteurs">{reste.length > MAX_LISTE ? `Voir les ${reste.length - MAX_LISTE} autres` : "Voir le détail de mes services"} →</Link>
            </section>

            {ssl.length + domaines.length > 0 ? (
              <section className="a-prevoir" aria-labelledby="titre-prevoir">
                <h2 id="titre-prevoir">À prévoir</h2>
                <ul>
                  {domaines.map((m) => (
                    <li key={`d-${m.id}`}>Votre nom de domaine <strong>{m.domaine}</strong> expire le {dateCourte(m.domaine_expire_le!)}. Renouvelez-le chez votre registraire, sinon le site disparaît.</li>
                  ))}
                  {ssl.map((m) => (
                    <li key={m.id}>Le certificat de <strong>{m.nom}</strong> expire le {dateCourte(m.ssl_expire_le!)}. Sans lui, les navigateurs afficheront « site non sécurisé ».</li>
                  ))}
                </ul>
              </section>
            ) : (
              <p className="rien-prevoir"><Coche taille={14} /> Aucun certificat ni nom de domaine n&apos;expire dans les 30 prochains jours.</p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
