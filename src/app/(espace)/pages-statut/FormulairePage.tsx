"use client";

import { useActionState, useState } from "react";
import { creerPageStatut } from "../actions";

/** « Boutique Kanté » → « boutique-kante ». */
function enAdresse(nom: string): string {
  return nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function FormulairePage({ appUrl }: { appUrl: string }) {
  const [etat, envoyer, enCours] = useActionState(creerPageStatut, undefined);
  const [nom, setNom] = useState("");
  const [slug, setSlug] = useState("");
  const [modifie, setModifie] = useState(false);
  return (
    <form action={envoyer} className="formulaire">
      {etat?.erreur && <p role="alert" className="alerte erreur">{etat.erreur}</p>}
      {etat?.ok && <p role="status" className="alerte succes">{etat.ok}</p>}
      <div className="grille-champs">
        <div className="champ">
          <label htmlFor="nom-page">Nom affiché</label>
          <input id="nom-page" name="nom" required minLength={2} maxLength={80} placeholder="Boutique Kanté" value={nom}
            onChange={(e) => { setNom(e.target.value); if (!modifie) setSlug(enAdresse(e.target.value)); }} />
        </div>
        <div className="champ">
          <label htmlFor="slug-page">Adresse de la page</label>
          <input id="slug-page" name="slug" required minLength={3} maxLength={40} pattern="[a-z0-9]([a-z0-9]|-){1,38}[a-z0-9]" value={slug}
            onChange={(e) => { setModifie(true); setSlug(e.target.value.toLowerCase()); }} aria-describedby="aide-slug" />
        </div>
      </div>
      <p id="aide-slug" className="pale">Vos clients la consulteront ici : <span className="code">{appUrl}/statut/{slug || "votre-adresse"}</span></p>
      <button type="submit" className="bouton" disabled={enCours}>{enCours ? "Création…" : "Créer la page"}</button>
    </form>
  );
}
