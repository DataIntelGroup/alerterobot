import type { Metadata } from "next";
import { gardeAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dateCourte, duree, heure } from "@/lib/format";

export const metadata: Metadata = { title: "Vue d'ensemble" };

type Lieu = { lieu: string; derniere: string | null; verifs_1h: number; echecs_1h: number; ms_moyen_1h: number | null; en_retard: number };
type Console = {
  genere_le: string;
  abonnes: { total: number; payants: number; nouveaux_7j: number; nouveaux_30j: number; revenu_mensuel: number; par_forfait: Record<string, number> };
  utilisateurs: number;
  moniteurs: { total: number; actifs: number; panne: number; lent: number; par_type: Record<string, number> };
  lieux: Lieu[];
  alertes_24h: { envoyees: number; echecs: number; en_attente: number; email: number; push: number };
  delai_alerte_s: { moyen: number | null; p95: number | null };
  incidents: { ouverts: number; trente_jours: number; duree_mediane_min: number | null };
  faux_positifs_7j: number;
};

const FORFAITS = [["decouverte", "Découverte"], ["essentiel", "Essentiel"], ["pro", "Pro"], ["agence", "Agence"]] as const;
const fcfa = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;

// Un worker est jugé silencieux s'il n'a rien vérifié depuis 5 minutes.
function etatLieu(l: Lieu): { texte: string; classe: string } {
  if (!l.derniere) return { texte: "Jamais démarré", classe: "etat-inconnu" };
  const age = Date.now() - new Date(l.derniere).getTime();
  return age < 5 * 60_000 ? { texte: "Actif", classe: "etat-ok" } : { texte: `Silencieux depuis ${duree(age)}`, classe: "etat-panne" };
}

export default async function AdminAccueil() {
  await gardeAdmin();
  const { data, error } = await supabaseAdmin().rpc("admin_console");
  if (error || !data) return <p role="alert" className="alerte erreur">Console indisponible : la base ne répond pas.</p>;
  const c = data as Console;
  const delai = c.delai_alerte_s.moyen;

  return (
    <div className="pile">
      <div className="entete">
        <div>
          <h1>Vue d&apos;ensemble</h1>
          <p className="pale">Mis à jour à {heure(c.genere_le)} · rechargez la page pour actualiser</p>
        </div>
      </div>

      <section aria-labelledby="titre-abonnes">
        <h2 id="titre-abonnes" className="sous-titre">Abonnés</h2>
        <div className="grille-kpi">
          <div className="carte"><p className="pale">Organisations</p><p className="kpi-valeur">{c.abonnes.total}</p><p className="pale">{c.utilisateurs} utilisateur{c.utilisateurs > 1 ? "s" : ""}</p></div>
          <div className="carte"><p className="pale">Abonnés payants</p><p className="kpi-valeur">{c.abonnes.payants}</p><p className="pale">{c.abonnes.total ? Math.round((100 * c.abonnes.payants) / c.abonnes.total) : 0} % des organisations</p></div>
          <div className="carte"><p className="pale">Revenu mensuel estimé</p><p className="kpi-valeur">{fcfa(c.abonnes.revenu_mensuel)}</p><p className="pale">au prix des forfaits, hors paiements réels</p></div>
          <div className="carte"><p className="pale">Nouveaux</p><p className="kpi-valeur">{c.abonnes.nouveaux_7j}</p><p className="pale">cette semaine · {c.abonnes.nouveaux_30j} sur 30 jours</p></div>
        </div>
        <div className="carte">
          <div className="table-boite">
            <table>
              <thead><tr><th scope="col">Forfait</th><th scope="col">Organisations</th><th scope="col">Revenu mensuel</th></tr></thead>
              <tbody>
                {FORFAITS.map(([cle, nom]) => {
                  const n = c.abonnes.par_forfait[cle] ?? 0;
                  const prix = { decouverte: 0, essentiel: 5000, pro: 15000, agence: 40000 }[cle];
                  return <tr key={cle}><td>{nom}</td><td className="mono">{n}</td><td className="mono">{fcfa(n * prix)}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section aria-labelledby="titre-perf">
        <h2 id="titre-perf" className="sous-titre">Performances de la plateforme</h2>
        <div className="grille-kpi">
          <div className="carte">
            <p className="pale">Délai panne → alerte · 30 jours</p>
            <p className={`kpi-valeur ${delai !== null && delai > 300 ? "etat-panne" : ""}`}>{delai !== null ? duree(delai * 1000) : "—"}</p>
            <p className="pale">promesse : moins de 5 min{c.delai_alerte_s.p95 !== null ? ` · 95 % sous ${duree(c.delai_alerte_s.p95 * 1000)}` : ""}</p>
          </div>
          <div className="carte"><p className="pale">Alertes envoyées · 24 h</p><p className="kpi-valeur">{c.alertes_24h.envoyees}</p><p className="pale">{c.alertes_24h.email} email · {c.alertes_24h.push} push</p></div>
          <div className="carte">
            <p className="pale">Envois en échec · 24 h</p>
            <p className={`kpi-valeur ${c.alertes_24h.echecs > 0 ? "etat-panne" : ""}`}>{c.alertes_24h.echecs}</p>
            <p className="pale">{c.alertes_24h.en_attente} en attente depuis plus d&apos;une minute</p>
          </div>
          <div className="carte"><p className="pale">Faux positifs évités · 7 jours</p><p className="kpi-valeur">{c.faux_positifs_7j}</p><p className="pale">échec d&apos;un seul lieu, non confirmé</p></div>
        </div>
        <div className="carte">
          <h3 className="sous-titre">Workers de vérification</h3>
          <div className="table-boite">
            <table>
              <thead><tr><th scope="col">Lieu</th><th scope="col">État</th><th scope="col">Dernière vérification</th><th scope="col">Vérifications · 1 h</th><th scope="col">Échecs · 1 h</th><th scope="col">Réponse moyenne</th><th scope="col">En retard</th></tr></thead>
              <tbody>
                {c.lieux.map((l) => {
                  const e = etatLieu(l);
                  return (
                    <tr key={l.lieu}>
                      <td>{l.lieu === "abidjan" ? "Abidjan" : "Paris"}</td>
                      <td><span className={`etat ${e.classe}`}>{e.texte}</span></td>
                      <td className="mono">{l.derniere ? `${dateCourte(l.derniere)} ${heure(l.derniere)}` : "—"}</td>
                      <td className="mono">{l.verifs_1h}</td>
                      <td className="mono">{l.echecs_1h}</td>
                      <td className="mono">{l.ms_moyen_1h !== null ? `${l.ms_moyen_1h} ms` : "—"}</td>
                      <td className={`mono ${l.en_retard > 0 ? "etat-lent" : ""}`}>{l.en_retard}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section aria-labelledby="titre-surveillance">
        <h2 id="titre-surveillance" className="sous-titre">Surveillance des clients</h2>
        <div className="grille-kpi">
          <div className="carte"><p className="pale">Moniteurs actifs</p><p className="kpi-valeur">{c.moniteurs.actifs}</p><p className="pale">sur {c.moniteurs.total} créés</p></div>
          <div className="carte"><p className="pale">En panne maintenant</p><p className={`kpi-valeur ${c.moniteurs.panne > 0 ? "etat-panne" : ""}`}>{c.moniteurs.panne}</p><p className="pale">{c.moniteurs.lent} lent{c.moniteurs.lent > 1 ? "s" : ""}</p></div>
          <div className="carte"><p className="pale">Incidents · 30 jours</p><p className="kpi-valeur">{c.incidents.trente_jours}</p><p className="pale">{c.incidents.ouverts} ouvert{c.incidents.ouverts > 1 ? "s" : ""}{c.incidents.duree_mediane_min !== null ? ` · médiane ${c.incidents.duree_mediane_min} min` : ""}</p></div>
          <div className="carte">
            <p className="pale">Par type</p>
            <p className="pale">{Object.entries(c.moniteurs.par_type).map(([t, n]) => `${t} ${n}`).join(" · ") || "aucun moniteur"}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
