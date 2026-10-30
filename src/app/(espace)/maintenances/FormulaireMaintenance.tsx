"use client";

import { useActionState } from "react";
import { creerMaintenance } from "../actions";

/** Valeur par défaut d'un champ datetime-local en heure d'Abidjan (UTC). */
function local(decalageH: number): string {
  const d = new Date(Date.now() + decalageH * 3600000);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export function FormulaireMaintenance({ moniteurs }: { moniteurs: { id: string; nom: string }[] }) {
  const [etat, envoyer, enCours] = useActionState(creerMaintenance, undefined);
  return (
    <form action={envoyer} className="formulaire">
      {etat?.erreur && <p role="alert" className="alerte erreur">{etat.erreur}</p>}
      {etat?.ok && <p role="status" className="alerte succes">{etat.ok}</p>}
      <div className="champ">
        <label htmlFor="moniteur">Service concerné</label>
        <select id="moniteur" name="moniteur" defaultValue="">
          <option value="">Tous les services</option>
          {moniteurs.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
        </select>
      </div>
      <div className="grille-champs">
        <div className="champ">
          <label htmlFor="debut">Début (heure d&apos;Abidjan)</label>
          <input id="debut" name="debut" type="datetime-local" required defaultValue={local(24)} />
        </div>
        <div className="champ">
          <label htmlFor="fin">Fin</label>
          <input id="fin" name="fin" type="datetime-local" required defaultValue={local(25)} />
        </div>
      </div>
      <div className="champ">
        <label htmlFor="motif">Motif, en une phrase (facultatif)</label>
        <input id="motif" name="motif" maxLength={200} placeholder="Mise à jour de la boutique" />
      </div>
      <label className="case">
        <input type="checkbox" name="publique" value="oui" defaultChecked />
        <span>L&apos;annoncer sur les pages de statut et prévenir les abonnés</span>
      </label>
      <button type="submit" className="bouton" disabled={enCours}>{enCours ? "Enregistrement…" : "Programmer"}</button>
    </form>
  );
}
