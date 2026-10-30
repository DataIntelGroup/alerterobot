"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Code, Copier, Globe, Loupe, Pouls, Telephone } from "@/components/Icones";
import { creerMoniteur } from "../../actions";

type Props = { clients: { id: string; nom: string }[]; forfait: string; appUrl: string };

const INTERVALLE_MIN: Record<string, number> = { decouverte: 300, essentiel: 180, pro: 60, agence: 60 };
const TYPES = [
  { valeur: "http", titre: "Site web", texte: "La page répond", icone: <Globe />, pro: false },
  { valeur: "mot_cle", titre: "Mot-clé", texte: "La page affiche un texte précis", icone: <Loupe />, pro: false },
  { valeur: "paiement", titre: "Paiement mobile money", texte: "Votre page ou API de paiement", icone: <Telephone />, pro: true },
  { valeur: "api", titre: "API", texte: "Une réponse JSON correcte", icone: <Code />, pro: true },
  { valeur: "heartbeat", titre: "Tâche de fond", texte: "Sauvegarde, facturation…", icone: <Pouls />, pro: true },
];
const EXEMPLES: Record<string, string> = {
  http: "https://votre-boutique.ci", mot_cle: "https://votre-boutique.ci/panier", paiement: "https://paiement.votre-boutique.ci", api: "https://api.votre-saas.ci/sante",
};

export function FormulaireMoniteur({ clients, forfait, appUrl }: Props) {
  const [etat, envoyer, enCours] = useActionState(creerMoniteur, undefined);
  const [type, setType] = useState("http");
  const [copie, setCopie] = useState(false);
  const min = INTERVALLE_MIN[forfait] ?? 300;
  const pro = forfait === "pro" || forfait === "agence";

  if (etat?.jetonHeartbeat) {
    const base = `${appUrl}/api/heartbeat/${etat.jetonHeartbeat}`;
    const lignes = [
      { titre: "À la fin de la tâche (obligatoire)", commande: `curl -fsS -m 10 ${base}` },
      { titre: "Au début de la tâche (facultatif : mesure la durée, détecte un blocage)", commande: `curl -fsS -m 10 ${base}/start` },
      { titre: "En cas d'échec (facultatif : alerte immédiate avec le message)", commande: `curl -fsS -m 10 --data-raw "$MESSAGE" ${base}/fail` },
    ];
    return (
      <div className="carte pile">
        <h2>C&apos;est prêt. Il reste à appeler AlerteRobot depuis votre tâche.</h2>
        <p className="doux">Si l&apos;appel de fin n&apos;arrive pas dans le délai prévu, vous êtes prévenu. Les deux autres appels donnent plus de détails.</p>
        {lignes.map((l, i) => (
          <div key={l.titre} className="pile-serree">
            <p className="pale">{l.titre}</p>
            <div className="secret">
              <code>{l.commande}</code>
              <button type="button" className="lien-icone" aria-label={`Copier la commande ${i + 1}`}
                onClick={() => navigator.clipboard?.writeText(l.commande).then(() => setCopie(true), () => setCopie(false))}>
                <Copier taille={18} />
              </button>
            </div>
          </div>
        ))}
        <p role="status" className="pale">{copie ? "Copié." : "Copiez-les maintenant : elles ne seront plus affichées. Gardez-les secrètes, elles suffisent à signaler votre tâche."}</p>
        <Link className="bouton" href="/tableau-de-bord">J&apos;ai copié, terminer</Link>
      </div>
    );
  }

  return (
    <form action={envoyer} className="formulaire carte">
      {etat?.erreur && <p role="alert" className="alerte erreur">{etat.erreur}</p>}
      <fieldset className="types champ">
        <legend>Ce que vous surveillez</legend>
        {TYPES.map((t) => {
          const bloque = t.pro && !pro;
          return (
            <label key={t.valeur} className="type">
              <input type="radio" name="type" value={t.valeur} checked={type === t.valeur} disabled={bloque} onChange={() => setType(t.valeur)} />
              {t.icone}
              <strong>{t.titre}</strong>
              <span>{t.texte}</span>
              {bloque && <span className="verrou">Forfait Pro</span>}
            </label>
          );
        })}
      </fieldset>

      <div className="champ">
        <label htmlFor="nom">Nom affiché dans les alertes</label>
        <input id="nom" name="nom" required minLength={2} maxLength={80}
          placeholder={type === "heartbeat" ? "Sauvegarde nocturne" : type === "paiement" ? "Paiement mobile money" : "Site de la boutique"} />
      </div>

      {type !== "heartbeat" ? (
        <div className="champ">
          <label htmlFor="url">Adresse</label>
          <input id="url" name="url" type="url" required maxLength={2048} placeholder={EXEMPLES[type]} inputMode="url" />
          <span className="aide">Vos propres services, ou ceux de vos clients avec leur accord.</span>
        </div>
      ) : (
        <div className="champ">
          <label htmlFor="heartbeat_periode_s">Votre tâche s&apos;exécute</label>
          <select id="heartbeat_periode_s" name="heartbeat_periode_s" defaultValue="86400">
            <option value="300">toutes les 5 minutes</option>
            <option value="3600">toutes les heures</option>
            <option value="86400">tous les jours</option>
            <option value="604800">toutes les semaines</option>
          </select>
          <span className="aide">Une marge de 30 minutes est laissée avant de vous alerter.</span>
        </div>
      )}
      {type === "heartbeat" && (
        <div className="champ">
          <label htmlFor="heartbeat_duree_max_s">Alerter si la tâche dure plus de</label>
          <select id="heartbeat_duree_max_s" name="heartbeat_duree_max_s" defaultValue="">
            <option value="">Pas de limite</option>
            <option value="600">10 minutes</option>
            <option value="1800">30 minutes</option>
            <option value="3600">1 heure</option>
            <option value="10800">3 heures</option>
          </select>
          <span className="aide">Fonctionne si la tâche signale son début avec l&apos;appel /start.</span>
        </div>
      )}

      {type === "mot_cle" && (
        <div className="champ">
          <label htmlFor="mot_cle">Texte qui doit apparaître sur la page</label>
          <input id="mot_cle" name="mot_cle" required maxLength={200} placeholder="Ajouter au panier" />
          <span className="aide">S&apos;il disparaît (page d&apos;erreur, page blanche), vous êtes prévenu.</span>
        </div>
      )}
      {type === "api" && (
        <div className="champ">
          <label htmlFor="champ_json">Champ JSON obligatoire (facultatif)</label>
          <input id="champ_json" name="champ_json" maxLength={200} placeholder="data.status" />
          <span className="aide">Utile quand l&apos;API répond 200 mais renvoie une réponse vide.</span>
        </div>
      )}

      {type !== "heartbeat" ? (
        <div className="grille-champs">
          <div className="champ">
            <label htmlFor="intervalle_s">Fréquence de vérification</label>
            <select id="intervalle_s" name="intervalle_s" defaultValue={String(min)}>
              {[60, 180, 300, 900].filter((s) => s >= min).map((s) => (
                <option key={s} value={s}>{s === 60 ? "chaque minute" : `toutes les ${s / 60} minutes`}</option>
              ))}
            </select>
            {min > 60 && <span className="aide">Chaque minute avec le forfait Pro.</span>}
          </div>
          <div className="champ">
            <label htmlFor="seuil_lent_ms">Lent au-delà de</label>
            <select id="seuil_lent_ms" name="seuil_lent_ms" defaultValue="2000">
              <option value="1000">1 seconde</option>
              <option value="2000">2 secondes (conseillé)</option>
              <option value="3000">3 secondes</option>
              <option value="5000">5 secondes</option>
            </select>
          </div>
        </div>
      ) : (
        <><input type="hidden" name="intervalle_s" value="300" /><input type="hidden" name="seuil_lent_ms" value="2000" /></>
      )}

      {clients.length > 0 && (
        <div className="champ">
          <label htmlFor="client_id">Pour quel client ?</label>
          <select id="client_id" name="client_id" defaultValue="">
            <option value="">Aucun (mon entreprise)</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
      )}

      <label className="case">
        <input type="checkbox" name="critique" value="oui" defaultChecked />
        <span><strong>Critique :</strong> me réveiller même pendant les heures silencieuses.</span>
      </label>
      <button type="submit" className="bouton plein" disabled={enCours}>{enCours ? "Enregistrement…" : "Lancer la surveillance"}</button>
    </form>
  );
}
