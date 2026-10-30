"use client";

import { useActionState } from "react";
import { enregistrerReglages } from "../actions";

type Org = { nom: string; rappel_min: number; escalade_min: number; silence_debut: string | null; silence_fin: string | null };

export function FormulaireReglages({ o }: { o: Org }) {
  const [etat, envoyer, enCours] = useActionState(enregistrerReglages, undefined);
  return (
    <form action={envoyer} className="formulaire">
      {etat?.erreur && <p role="alert" className="alerte erreur">{etat.erreur}</p>}
      {etat?.ok && <p role="status" className="alerte succes">{etat.ok}</p>}
      <div className="champ">
        <label htmlFor="nom">Nom de l&apos;organisation</label>
        <input id="nom" name="nom" required minLength={2} maxLength={80} defaultValue={o.nom} />
        <span className="aide">Il apparaît dans les alertes et les rapports.</span>
      </div>
      <div className="grille-champs">
        <div className="champ">
          <label htmlFor="rappel_min">Rappel tant que personne ne répond</label>
          <select id="rappel_min" name="rappel_min" defaultValue={String(o.rappel_min)}>
            <option value="15">toutes les 15 minutes</option>
            <option value="30">toutes les 30 minutes</option>
          </select>
        </div>
        <div className="champ">
          <label htmlFor="escalade_min">Prévenir le niveau suivant après</label>
          <select id="escalade_min" name="escalade_min" defaultValue={String(o.escalade_min)}>
            {[15, 30, 60].map((v) => <option key={v} value={v}>{v} minutes sans réponse</option>)}
          </select>
        </div>
      </div>
      <fieldset className="champ jours">
        <legend>Heures silencieuses (heure d&apos;Abidjan)</legend>
        <label className="case">
          <input type="checkbox" name="silence" value="oui" defaultChecked={Boolean(o.silence_debut)} />
          <span>La nuit, ne me réveiller que pour les moniteurs critiques. Les autres alertes attendent la fin du créneau.</span>
        </label>
        <div className="grille-champs">
          <div className="champ">
            <label htmlFor="silence_debut">De</label>
            <input id="silence_debut" name="silence_debut" type="time" defaultValue={o.silence_debut?.slice(0, 5) ?? "22:00"} />
          </div>
          <div className="champ">
            <label htmlFor="silence_fin">À</label>
            <input id="silence_fin" name="silence_fin" type="time" defaultValue={o.silence_fin?.slice(0, 5) ?? "07:00"} />
          </div>
        </div>
      </fieldset>
      <button type="submit" className="bouton" disabled={enCours}>{enCours ? "Enregistrement…" : "Enregistrer"}</button>
    </form>
  );
}
