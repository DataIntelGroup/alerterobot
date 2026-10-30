import { dateCourte, duree, heure, pourcentage } from "@/lib/format";
import { Abonnement } from "@/app/statut/Abonnement";

export type Jour = { jour: string; pannes: number; maintenance: boolean };
export type Statut = {
  nom: string;
  services: { nom: string; etat: string; disponibilite: number; jours: Jour[] }[];
  incidents: { service: string; debut: string; fin: string | null; maj?: { etape: string; message: string; le: string }[] }[];
  maintenances?: { debut: string; fin: string; motif: string | null; service: string | null }[];
};

const ETAPES: Record<string, string> = { analyse: "En cours d'analyse", identifie: "Cause identifiée", surveillance: "Sous surveillance", resolu: "Résolu" };

function libelleJour(j: Jour): string {
  return `${dateCourte(j.jour)} : ${j.pannes > 0 ? `interruption de ${duree(j.pannes * 60000)}` : j.maintenance ? "maintenance programmée" : "aucun incident"}`;
}

/** Page de statut publique d'un client : rien d'autre que ce que statut_public renvoie. */
export function VueStatut({ s, slug }: { s: Statut; slug?: string }) {
  const enPanne = s.services.filter((x) => x.etat === "panne");
  const maintenant = Date.now();
  const maintenances = s.maintenances ?? [];
  const enMaintenance = maintenances.filter((m) => new Date(m.debut).getTime() <= maintenant);
  return (
    <div className="statut">
      <main className="cadre">
        <header className="tete">
          <span className="initiale" aria-hidden="true">{s.nom.trim().charAt(0).toUpperCase()}</span>
          <div><h1>{s.nom}</h1><p className="pale">État des services</p></div>
        </header>
        <Abonnement slug={slug} />

        <section className={`bandeau${enPanne.length ? " incident" : enMaintenance.length ? " maintenance" : ""}`} aria-label="État actuel">
          <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {enPanne.length ? <path d="M12 3 2 20h20zM12 10v4M12 17h.01" /> : <><circle cx="12" cy="12" r="9.5" /><path d="m7.5 12.5 3 3 6-6.5" /></>}
          </svg>
          <div>
            <h2>{enPanne.length ? `${enPanne.map((x) => x.nom).join(", ")} : interruption en cours` : enMaintenance.length ? "Maintenance en cours" : "Tous les services fonctionnent"}</h2>
            <p>{enPanne.length ? "L'équipe a été prévenue et travaille au rétablissement." : enMaintenance.length ? `Fin prévue à ${heure(enMaintenance[0].fin)}.` : "Vérifiés en continu depuis Abidjan et Paris."}</p>
          </div>
        </section>

        {maintenances.length > 0 && (
          <section className="bloc" aria-labelledby="titre-maintenances">
            <h2 id="titre-maintenances">Maintenances programmées</h2>
            {maintenances.map((m) => (
              <div key={m.debut + (m.service ?? "")} className="service">
                <div className="incident-ligne">
                  <h3>{m.service ?? "Tous les services"}</h3>
                  <span className="badge maintenance">{new Date(m.debut).getTime() <= maintenant ? "En cours" : "Prévue"}</span>
                </div>
                <p className="pale">{dateCourte(m.debut)} · {heure(m.debut)} – {heure(m.fin)} (heure d&apos;Abidjan)</p>
                {m.motif && <p>{m.motif}</p>}
              </div>
            ))}
          </section>
        )}

        <section className="bloc" aria-labelledby="titre-services">
          <div className="bloc-tete">
            <h2 id="titre-services">Services</h2>
            <span className="pale"><span className="lg">90 derniers jours</span><span className="sm">30 derniers jours</span></span>
          </div>
          {s.services.length === 0 && <p className="pale">Aucun service n&apos;est encore affiché sur cette page.</p>}
          {s.services.map((x) => (
            <div key={x.nom} className="service">
              <div className="ligne">
                <h3>{x.nom}</h3>
                <div>
                  <span className="mono pale">{pourcentage(x.disponibilite)}</span>
                  <span className={x.etat === "panne" ? "hors-service" : "operationnel"}>{x.etat === "panne" ? "Interrompu" : "Opérationnel"}</span>
                </div>
              </div>
              <div className="barres" role="list" aria-label={`Historique de ${x.nom}`}>
                {x.jours.map((j, i) => (
                  <span key={j.jour} role="listitem" title={libelleJour(j)} aria-label={libelleJour(j)}
                    className={`barre${j.pannes > 0 ? " panne" : j.maintenance ? " maintenance" : ""}${i < x.jours.length - 30 ? " ancien" : ""}`} />
                ))}
              </div>
            </div>
          ))}
          {s.services.length > 0 && (
            <>
              <div className="bornes"><span><span className="lg">Il y a 90 jours</span><span className="sm">Il y a 30 jours</span></span><span>Aujourd&apos;hui</span></div>
              <div className="legende-statut"><span><i />Aucun incident</span><span><i className="panne" />Interruption</span><span><i className="maintenance" />Maintenance</span></div>
            </>
          )}
        </section>

        <section className="bloc" aria-labelledby="titre-historique">
          <h2 id="titre-historique">Historique des incidents</h2>
          {s.incidents.length === 0 && <p className="pale">Aucun incident sur les 90 derniers jours.</p>}
          {s.incidents.map((i) => (
            <div key={`${i.service}-${i.debut}`} className="service">
              <div className="incident-ligne">
                <h3>{i.service} {i.fin ? "indisponible" : "interrompu"}</h3>
                <span className={`badge${i.fin ? "" : " encours"}`}>{i.fin ? "Résolu" : "En cours"}</span>
              </div>
              <p className="pale">{dateCourte(i.debut)} · {heure(i.debut)}{i.fin ? ` – ${heure(i.fin)} · ${duree(new Date(i.fin).getTime() - new Date(i.debut).getTime())}` : " · en cours"}</p>
              {i.maj && i.maj.length > 0 && (
                <ol className="maj">
                  {i.maj.map((u) => (
                    <li key={u.le + u.etape}><strong>{heure(u.le)} · {ETAPES[u.etape] ?? u.etape}.</strong> {u.message}</li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </section>

        <p className="pied">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>
          Surveillé par AlerteRobot
        </p>
      </main>
    </div>
  );
}
