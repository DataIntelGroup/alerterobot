import Link from "next/link";
import { Plus } from "@/components/Icones";
import { ETATS, TYPES, dateCourte, duree, heure, ilYA, pourcentage } from "@/lib/format";
import { rapidite } from "@/lib/phrases";
import type { Moniteur } from "@/components/espace/VueEnsemble";

export type MoniteurTuile = Moniteur & { cree_le: string };
export type Interruption = { moniteur_id: string; debut: string; fin: string | null };
export type Point = { heure: string; lieu: string; ms: number };

export const FILTRES = {
  tous: "Tous",
  problemes: "À regarder",
  sites: "Sites et API",
  taches: "Tâches planifiées",
} as const;
export type Filtre = keyof typeof FILTRES;

export type DonneesServices = {
  orgNom: string;
  ecriture: boolean;
  maintenant: number;
  filtre: Filtre;
  moniteurs: MoniteurTuile[];
  interruptions: Interruption[];
  courbe: Point[];
};

const JOUR = 86400000;
const NB_JOURS = 60;

function garde(m: MoniteurTuile, f: Filtre): boolean {
  if (f === "problemes") return m.actif !== false && m.etat !== "ok";
  if (f === "sites") return m.type !== "heartbeat";
  if (f === "taches") return m.type === "heartbeat";
  return true;
}

/** Minutes d'interruption de chaque jour (heure d'Abidjan = UTC), du plus ancien au plus récent. */
function joursDuService(m: MoniteurTuile, interruptions: Interruption[], maintenant: number) {
  const aujourdhui = Math.floor(maintenant / JOUR) * JOUR;
  const cree = new Date(m.cree_le).getTime();
  const siennes = interruptions.filter((i) => i.moniteur_id === m.id)
    .map((i) => [new Date(i.debut).getTime(), i.fin ? new Date(i.fin).getTime() : maintenant] as const);
  let panne = 0;
  const jours = Array.from({ length: NB_JOURS }, (_, k) => {
    const debut = aujourdhui - (NB_JOURS - 1 - k) * JOUR;
    const fin = Math.min(debut + JOUR, maintenant);
    if (fin <= cree) return "v";
    const ms = siennes.reduce((s, [a, b]) => s + Math.max(0, Math.min(b, fin) - Math.max(a, debut, cree)), 0);
    panne += ms;
    return ms === 0 ? "o" : ms < 30 * 60000 ? "a" : "p";
  });
  const observe = maintenant - Math.max(cree, aujourdhui - (NB_JOURS - 1) * JOUR);
  return { jours, dispo: observe > 0 ? 100 - (100 * panne) / observe : null };
}

function Anneau({ part, texte }: { part: number; texte: string }) {
  const r = 32, c = 2 * Math.PI * r;
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r={r} fill="none" stroke="#f5f0e8" strokeWidth="9" />
      <circle cx="40" cy="40" r={r} fill="none" stroke={part >= 1 ? "#22a06b" : "#d64545"} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${(c * Math.max(part, 0.02)).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 40 40)" />
      <text x="40" y="46" textAnchor="middle" fontWeight="800" fontSize="17" fill="#1c1917">{texte}</text>
    </svg>
  );
}

export function VueServices({ d, lien = (f) => (f === "tous" ? "/moniteurs" : `/moniteurs?voir=${f}`) }: { d: DonneesServices; lien?: (f: Filtre) => string }) {
  const actifs = d.moniteurs.filter((m) => m.actif !== false);
  const enLigne = actifs.filter((m) => m.etat === "ok").length;
  const pannes = actifs.filter((m) => m.etat === "panne").length;
  const aSurveiller = actifs.filter((m) => m.etat === "lent" || m.etat === "suspect").length;
  const tuiles = d.moniteurs.map((m) => ({ m, ...joursDuService(m, d.interruptions, d.maintenant) }));
  const visibles = tuiles.filter((t) => garde(t.m, d.filtre))
    .sort((a, b) => Number(b.m.etat === "panne") - Number(a.m.etat === "panne") || Number(b.m.etat !== "ok") - Number(a.m.etat !== "ok"));

  // Résumé sur 30 jours, comme les rapports.
  const debut30 = d.maintenant - 30 * JOUR;
  const recentes = d.interruptions.filter((i) => !i.fin || new Date(i.fin).getTime() >= debut30);
  const minutesPanne = recentes.reduce((s, i) => s + (new Date(i.fin ?? d.maintenant).getTime() - Math.max(new Date(i.debut).getTime(), debut30)), 0) / 60000;
  const dispo30 = actifs.length ? Math.max(0, 100 - (100 * minutesPanne) / (30 * 24 * 60 * actifs.length)) : null;
  const durees = recentes.filter((i) => i.fin).map((i) => new Date(i.fin!).getTime() - new Date(i.debut).getTime()).sort((a, b) => a - b);
  const mediane = durees.length ? durees[Math.floor(durees.length / 2)] : null;
  const abidjan = d.courbe.filter((p) => p.lieu === "abidjan");
  const moyenne = abidjan.length ? Math.round(abidjan.reduce((s, p) => s + p.ms, 0) / abidjan.length) : null;
  const compte: Record<Filtre, number> = {
    tous: d.moniteurs.length,
    problemes: d.moniteurs.filter((m) => garde(m, "problemes")).length,
    sites: d.moniteurs.filter((m) => garde(m, "sites")).length,
    taches: d.moniteurs.filter((m) => garde(m, "taches")).length,
  };

  return (
    <>
      <div className="services-tete">
        <div>
          <h1>Mes services</h1>
          <p>{d.orgNom} · vérifiés toutes les 1 à 5 minutes depuis Abidjan et Paris</p>
        </div>
        {d.ecriture && <Link className="bouton" href="/moniteurs/nouveau"><Plus taille={16} />Surveiller un service</Link>}
      </div>

      {d.moniteurs.length === 0 ? (
        <section className="vide-accueil">
          <strong>Aucun service surveillé pour l&apos;instant</strong>
          <p>Ajoutez l&apos;adresse d&apos;un site, d&apos;une API, d&apos;une page de paiement ou une tâche planifiée. Chaque service aura ici sa tuile, avec ses 60 derniers jours.</p>
          {d.ecriture && <Link className="bouton" href="/moniteurs/nouveau"><Plus taille={16} />Ajouter mon premier service</Link>}
        </section>
      ) : (
        <>
          <div className="resume">
            <div className="score">
              <Anneau part={actifs.length ? enLigne / actifs.length : 1} texte={`${enLigne}/${actifs.length}`} />
              <div>
                <strong>{enLigne === actifs.length ? "Tous vos services sont en ligne" : `${enLigne} service${enLigne > 1 ? "s" : ""} sur ${actifs.length} en ligne`}</strong>
                <span>{[pannes && `${pannes} en panne`, aSurveiller && `${aSurveiller} à surveiller`].filter(Boolean).join(", ") || "Rien à signaler"}</span>
              </div>
            </div>
            <div><small>Disponibilité · 30 j</small><b>{dispo30 !== null ? pourcentage(dispo30) : "—"}</b><em>{minutesPanne >= 1 ? `${duree(minutesPanne * 60000)} de panne` : "aucune panne"}</em></div>
            <div><small>Rapidité moyenne</small><b>{moyenne !== null ? rapidite(moyenne) : "—"}</b><em>depuis Abidjan · 24 h</em></div>
            <div><small>Pannes · 30 j</small><b>{recentes.length}</b><em>{pannes ? `dont ${pannes} en cours` : "toutes résolues"}</em></div>
            <div><small>Réparées en</small><b>{mediane !== null ? duree(mediane) : "—"}</b><em>durée médiane</em></div>
          </div>

          <nav className="filtres-pastilles" aria-label="Filtrer les services">
            {(Object.keys(FILTRES) as Filtre[]).map((f) => (
              <Link key={f} href={lien(f)} aria-current={d.filtre === f ? "true" : undefined}>{FILTRES[f]} · {compte[f]}</Link>
            ))}
          </nav>

          {visibles.length === 0 ? <p className="pale">Aucun service dans ce filtre{d.filtre === "problemes" ? " : tout va bien." : "."}</p> : (
            <div className="tuiles">
              {visibles.map(({ m, jours, dispo }) => {
                const etat = m.actif === false ? "pause" : m.etat;
                const verif = m.derniere_verif ?? m.dernier_signal;
                const sslProche = m.ssl_expire_le && new Date(m.ssl_expire_le).getTime() - d.maintenant < 30 * JOUR;
                return (
                  <Link key={m.id} href={`/moniteurs/${m.id}`} className={`tuile ${etat}`}>
                    <div className="tuile-tete">
                      <div><h2>{m.nom}</h2><span className="pale">{TYPES[m.type] ?? m.type}{m.client ? ` · ${m.client}` : ""}</span></div>
                      <span className={`puce ${etat}`}>
                        {etat === "pause" ? "En pause" : etat === "panne" ? `En panne · ${duree(d.maintenant - new Date(m.etat_depuis).getTime())}` : ETATS[etat] ?? etat}
                      </span>
                    </div>
                    <div className="tuile-milieu">
                      <div><b>{dispo !== null ? pourcentage(dispo) : "—"}</b><small>disponible sur 60 jours</small></div>
                      {m.type === "heartbeat"
                        ? <div className="droite"><b>{m.dernier_signal ? heure(m.dernier_signal) : "—"}</b><small>dernier signal</small></div>
                        : <div className="droite"><b>{etat === "panne" || m.dernier_ms === null ? "—" : rapidite(m.dernier_ms)}</b><small>dernière réponse</small></div>}
                    </div>
                    {etat === "panne" && <p className="tuile-alerte">Ne répond plus depuis {heure(m.etat_depuis)}. Ouvrez pour voir ce qu&apos;on a mesuré.</p>}
                    {sslProche && etat !== "panne" && <p className="tuile-alerte">Certificat à renouveler avant le {dateCourte(m.ssl_expire_le!)}.</p>}
                    <div className="jours60" role="img" aria-label={`60 derniers jours : ${jours.filter((j) => j === "p").length} jour(s) avec panne, ${jours.filter((j) => j === "a").length} avec une courte coupure`}>
                      {jours.map((j, k) => <i key={k} className={j} />)}
                    </div>
                    <div className="jours60-bornes">
                      <span className="loin">il y a 60 jours</span><span className="proche">il y a 30 jours</span>
                      <span>{etat === "pause" ? "en pause" : verif ? `vérifié ${ilYA(verif, d.maintenant)}` : "jamais vérifié"}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
