"use client";

import { useActionState } from "react";
import type { Etat } from "../actions";

export function FormulaireEmail({ action }: { action: (etat: Etat, form: FormData) => Promise<Etat> }) {
  const [etat, envoyer, enCours] = useActionState(action, undefined);
  if (etat?.message) return <p role="status" className="alerte succes">{etat.message}</p>;
  return (
    <form action={envoyer} className="formulaire">
      {etat?.erreur && <p role="alert" className="alerte erreur">{etat.erreur}</p>}
      <div className="champ">
        <label htmlFor="email">Adresse email</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="vous@entreprise.ci" />
      </div>
      <button type="submit" className="bouton plein" disabled={enCours}>{enCours ? "Envoi…" : "Recevoir le lien"}</button>
    </form>
  );
}
