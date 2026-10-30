"use client";

import { useActionState } from "react";
import { creerOrganisation } from "@/app/(espace)/actions";

export function FormulaireOrganisation() {
  const [etat, envoyer, enCours] = useActionState(creerOrganisation, undefined);
  return (
    <form action={envoyer} className="formulaire">
      {etat?.erreur && <p role="alert" className="alerte erreur">{etat.erreur}</p>}
      <div className="champ">
        <label htmlFor="nom">Nom de l&apos;entreprise ou de l&apos;agence</label>
        <input id="nom" name="nom" required minLength={2} maxLength={80} autoComplete="organization" placeholder="Boutique Kanté, Agence Lagune Digital…" />
        <span className="aide">Vous pourrez le modifier plus tard.</span>
      </div>
      <button type="submit" className="bouton plein" disabled={enCours}>{enCours ? "Un instant…" : "Continuer vers ma première adresse"}</button>
    </form>
  );
}
