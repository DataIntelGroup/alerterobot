"use client";

import { useActionState, useState } from "react";
import { Copier } from "@/components/Icones";
import { modifierMoniteur, nouveauJetonHeartbeat } from "../../actions";

export type MoniteurModif = {
  id: string; type: string; nom: string; url: string | null; mot_cle: string | null; champ_json: string | null;
  seuil_lent_ms: number; intervalle_s: number; critique: boolean; client_id: string | null;
  heartbeat_periode_s: number | null; heartbeat_duree_max_s: number | null;
};

const INTERVALLE_MIN: Record<string, number> = { decouverte: 300, essentiel: 180, pro: 60, agence: 60 };

export function FormulaireModif({ m, clients, forfait }: { m: MoniteurModif; clients: { id: string; nom: string }[]; forfait: string }) {
  const [etat, envoyer, enCours] = useActionState(modifierMoniteur, undefined);
  const min = INTERVALLE_MIN[forfait] ?? 300;
  const intervalles = [...new Set([60, 180, 300, 900, m.intervalle_s])].filter((s) => s >= min || s === m.intervalle_s).sort((a, b) => a - b);
  return (
    <form action={envoyer} className="formulaire">
      <input type="hidden" name="id" value={m.id} />
      {etat?.erreur && <p role="alert" className="alerte erreur">{etat.erreur}</p>}
      {etat?.ok && <p role="status" className="alerte succes">{etat.ok}</p>}
      <div className="champ">
        <label htmlFor="nom">Nom affiché dans les alertes</label>
        <input id="nom" name="nom" required minLength={2} maxLength={80} defaultValue={m.nom} />
      </div>
      {m.type !== "heartbeat" ? (
        <>
          <div className="champ">
            <label htmlFor="url">Adresse</label>
            <input id="url" name="url" type="url" required maxLength={2048} defaultValue={m.url ?? ""} inputMode="url" />
          </div>
          {(m.type === "mot_cle" || m.mot_cle) && (
            <div className="champ">
              <label htmlFor="mot_cle">Texte qui doit apparaître sur la page</label>
              <input id="mot_cle" name="mot_cle" maxLength={200} required={m.type === "mot_cle"} defaultValue={m.mot_cle ?? ""} />
            </div>
          )}
          {m.type === "api" && (
            <div className="champ">
              <label htmlFor="champ_json">Champ JSON obligatoire (facultatif)</label>
              <input id="champ_json" name="champ_json" maxLength={200} defaultValue={m.champ_json ?? ""} placeholder="data.status" />
            </div>
          )}
          <div className="grille-champs">
            <div className="champ">
              <label htmlFor="intervalle_s">Fréquence de vérification</label>
              <select id="intervalle_s" name="intervalle_s" defaultValue={String(m.intervalle_s)}>
                {intervalles.map((s) => <option key={s} value={s}>{s === 60 ? "chaque minute" : `toutes les ${s / 60} minutes`}</option>)}
              </select>
            </div>
            <div className="champ">
              <label htmlFor="seuil_lent_ms">Lent au-delà de</label>
              <select id="seuil_lent_ms" name="seuil_lent_ms" defaultValue={String(m.seuil_lent_ms)}>
                {[...new Set([1000, 2000, 3000, 5000, m.seuil_lent_ms])].sort((a, b) => a - b).map((v) => (
                  <option key={v} value={v}>{v % 1000 === 0 ? `${v / 1000} seconde${v > 1000 ? "s" : ""}` : `${v} ms`}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      ) : (
        <div className="grille-champs">
          <div className="champ">
            <label htmlFor="heartbeat_periode_s">La tâche s&apos;exécute</label>
            <select id="heartbeat_periode_s" name="heartbeat_periode_s" defaultValue={String(m.heartbeat_periode_s ?? 86400)}>
              {[[300, "toutes les 5 minutes"], [3600, "toutes les heures"], [86400, "tous les jours"], [604800, "toutes les semaines"]].map(([v, t]) => (
                <option key={v} value={v}>{t}</option>
              ))}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="heartbeat_duree_max_s">Alerter si elle dure plus de</label>
            <select id="heartbeat_duree_max_s" name="heartbeat_duree_max_s" defaultValue={String(m.heartbeat_duree_max_s ?? "")}>
              <option value="">Pas de limite</option>
              {[[600, "10 minutes"], [1800, "30 minutes"], [3600, "1 heure"], [10800, "3 heures"]].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
        </div>
      )}
      {clients.length > 0 && (
        <div className="champ">
          <label htmlFor="client_id">Client</label>
          <select id="client_id" name="client_id" defaultValue={m.client_id ?? ""}>
            <option value="">Aucun (mon entreprise)</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
      )}
      <label className="case">
        <input type="checkbox" name="critique" value="oui" defaultChecked={m.critique} />
        <span><strong>Critique :</strong> me réveiller même pendant les heures silencieuses.</span>
      </label>
      <button type="submit" className="bouton" disabled={enCours}>{enCours ? "Enregistrement…" : "Enregistrer les modifications"}</button>
    </form>
  );
}

export function NouveauJeton({ id, appUrl }: { id: string; appUrl: string }) {
  const [etat, envoyer, enCours] = useActionState(nouveauJetonHeartbeat, undefined);
  const [copie, setCopie] = useState(false);
  if (etat?.jetonHeartbeat) {
    const base = `${appUrl}/api/heartbeat/${etat.jetonHeartbeat}`;
    return (
      <div className="pile">
        <p className="alerte succes">Nouvelle adresse créée. L&apos;ancienne ne fonctionne plus : mettez votre tâche à jour.</p>
        <div className="secret">
          <code>curl -fsS -m 10 {base}</code>
          <button type="button" className="lien-icone" aria-label="Copier la commande"
            onClick={() => navigator.clipboard?.writeText(`curl -fsS -m 10 ${base}`).then(() => setCopie(true), () => setCopie(false))}>
            <Copier taille={18} />
          </button>
        </div>
        <p className="pale">{copie ? "Copié." : `Début : ${base}/start · Échec : ${base}/fail`}</p>
      </div>
    );
  }
  return (
    <form action={envoyer} className="pile">
      <input type="hidden" name="id" value={id} />
      {etat?.erreur && <p role="alert" className="alerte erreur">{etat.erreur}</p>}
      <p className="pale">Vous avez perdu l&apos;adresse, ou elle a pu être vue par quelqu&apos;un d&apos;autre ? Créez-en une nouvelle : l&apos;ancienne cessera aussitôt de fonctionner.</p>
      <button type="submit" className="bouton secondaire" disabled={enCours}>{enCours ? "Création…" : "Créer une nouvelle adresse"}</button>
    </form>
  );
}
