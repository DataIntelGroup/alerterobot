"use client";

import { useActionState } from "react";
import { abonner } from "./actions";

export function Abonnement({ slug }: { slug?: string }) {
  const [etat, envoyer, enCours] = useActionState(abonner, undefined);
  if (etat?.ok) return <p role="status" className="note-abonnement">{etat.ok}</p>;
  return (
    <form action={envoyer} className="abonnement">
      <input type="hidden" name="slug" value={slug ?? ""} />
      <label htmlFor="email-abonnement" className="masque">Votre email</label>
      <input id="email-abonnement" name="email" type="email" required maxLength={254} placeholder="vous@exemple.ci" disabled={!slug} />
      <button type="submit" disabled={enCours || !slug}>{enCours ? "Un instant…" : "Être prévenu par email"}</button>
      {etat?.erreur && <p role="alert" className="note-abonnement erreur">{etat.erreur}</p>}
    </form>
  );
}
