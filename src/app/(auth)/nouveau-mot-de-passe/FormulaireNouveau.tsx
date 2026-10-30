"use client";

import { useActionState, useState } from "react";
import { Oeil } from "@/components/Icones";
import { nouveauMotDePasse } from "../actions";

export function FormulaireNouveau() {
  const [etat, envoyer, enCours] = useActionState(nouveauMotDePasse, undefined);
  const [visible, setVisible] = useState(false);
  return (
    <form action={envoyer} className="formulaire">
      {etat?.erreur && <p role="alert" className="alerte erreur">{etat.erreur}</p>}
      <div className="champ">
        <label htmlFor="motDePasse">Nouveau mot de passe</label>
        <div className="champ-mdp">
          <input id="motDePasse" name="motDePasse" type={visible ? "text" : "password"} required minLength={12} maxLength={128} autoComplete="new-password" />
          <button type="button" className="lien-icone" onClick={() => setVisible(!visible)}
            aria-label={visible ? "Masquer les mots de passe" : "Afficher les mots de passe"} aria-pressed={visible}>
            <Oeil taille={18} />
          </button>
        </div>
      </div>
      <div className="champ">
        <label htmlFor="confirmation">Le même, une seconde fois</label>
        <input id="confirmation" name="confirmation" type={visible ? "text" : "password"} required minLength={12} maxLength={128} autoComplete="new-password" />
      </div>
      <button type="submit" className="bouton plein" disabled={enCours}>{enCours ? "Enregistrement…" : "Enregistrer et me connecter"}</button>
    </form>
  );
}
