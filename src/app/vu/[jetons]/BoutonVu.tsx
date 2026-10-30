"use client";

import Link from "next/link";
import { useActionState } from "react";
import { confirmer } from "./actions";

const TEXTES = {
  ok: "Merci, c'est noté. Les rappels sont arrêtés. Bon courage pour le dépannage !",
  deja: "C'était déjà noté : les rappels sont arrêtés.",
  invalide: "Ce lien a expiré (il est valable 24 h) ou a déjà servi. Ouvrez l'incident depuis votre tableau de bord.",
  limite: "Trop de tentatives d'un coup. Patientez quelques minutes, puis réessayez.",
};

export function BoutonVu({ jetons }: { jetons: string }) {
  const [etat, envoyer, enCours] = useActionState(confirmer, undefined);
  if (etat) {
    const bon = etat.statut === "ok" || etat.statut === "deja";
    return (
      <div className="pile">
        <p role="status" className={`alerte ${bon ? "succes" : "erreur"}`}>
          {TEXTES[etat.statut]}{bon && etat.moniteurs.length ? ` (${etat.moniteurs.join(", ")})` : ""}
        </p>
        <Link className="bouton secondaire" href="/tableau-de-bord">Ouvrir mon tableau de bord</Link>
      </div>
    );
  }
  return (
    <form action={envoyer}>
      <input type="hidden" name="jetons" value={jetons} />
      <button type="submit" className="bouton plein" disabled={enCours}>{enCours ? "Un instant…" : "Oui, je m'en occupe"}</button>
    </form>
  );
}
