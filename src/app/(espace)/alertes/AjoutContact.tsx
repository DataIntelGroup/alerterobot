"use client";

import { useActionState, useRef } from "react";
import { ajouterContact } from "../actions";

export function AjoutContact() {
  const formulaire = useRef<HTMLFormElement>(null);
  const [etat, envoyer, enCours] = useActionState(async (avant: Parameters<typeof ajouterContact>[0], form: FormData) => {
    const r = await ajouterContact(avant, form);
    if (r?.ok) formulaire.current?.reset();
    return r;
  }, undefined);
  return (
    <form ref={formulaire} action={envoyer} className="formulaire">
      {etat?.erreur && <p role="alert" className="alerte erreur">{etat.erreur}</p>}
      {etat?.ok && <p role="status" className="alerte succes">{etat.ok}</p>}
      <div className="grille-champs">
        <div className="champ">
          <label htmlFor="nom-contact">Nom</label>
          <input id="nom-contact" name="nom" required minLength={2} maxLength={80} placeholder="Moussa, développeur" />
        </div>
        <div className="champ">
          <label htmlFor="email-contact">Email</label>
          <input id="email-contact" name="email" type="email" required maxLength={254} placeholder="moussa@entreprise.ci" />
        </div>
      </div>
      <div className="champ">
        <label htmlFor="niveau-contact">Quand le prévenir ?</label>
        <select id="niveau-contact" name="niveau" defaultValue="2">
          <option value="1">Dès la première alerte</option>
          <option value="2">Si personne n&apos;a répondu après 30 min (niveau 2)</option>
          <option value="3">En dernier recours (niveau 3)</option>
        </select>
      </div>
      <button type="submit" className="bouton secondaire" disabled={enCours}>{enCours ? "Ajout…" : "Ajouter ce contact"}</button>
    </form>
  );
}
