"use client";

import { useActionState } from "react";

type Etat = { fait?: string; erreur?: boolean } | undefined;
type Props = {
  jeton: string;
  action: (etat: Etat, form: FormData) => Promise<Etat>;
  bouton: string;
  /** Message de réussite ; « {nom} » est remplacé par le nom de la page. */
  succes: string;
};

/**
 * Un clic confirme l'action : un lien ouvert par l'antivirus d'une messagerie
 * ne doit ni abonner ni désabonner personne à sa place.
 */
export function BoutonLien({ jeton, action, bouton, succes }: Props) {
  const [etat, envoyer, enCours] = useActionState(action, undefined);
  if (etat?.fait) return <p role="status" className="alerte succes">{succes.replace("{nom}", etat.fait === "ok" ? "cette page" : etat.fait)}</p>;
  return (
    <form action={envoyer} className="pile">
      {etat?.erreur && <p role="alert" className="alerte erreur">Ce lien n&apos;est plus valable. Recommencez depuis la page de statut.</p>}
      <input type="hidden" name="j" value={jeton} />
      <button type="submit" className="bouton plein" disabled={enCours}>{enCours ? "Un instant…" : bouton}</button>
    </form>
  );
}
