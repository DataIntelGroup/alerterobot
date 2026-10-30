"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Oeil } from "@/components/Icones";
import type { Etat } from "./actions";

type Props = {
  action: (etat: Etat, form: FormData) => Promise<Etat>;
  bouton: string;
  inscription?: boolean;
};

export function FormulaireAuth({ action, bouton, inscription = false }: Props) {
  const [etat, envoyer, enCours] = useActionState(action, undefined);
  const [visible, setVisible] = useState(false);
  if (etat?.message) {
    return (
      <div className="pile" role="status">
        <p className="alerte succes">{etat.message}</p>
        <p className="pale">Rien reçu après quelques minutes ? Regardez dans les courriers indésirables.</p>
      </div>
    );
  }
  return (
    <form action={envoyer} className="formulaire">
      {etat?.erreur && <p role="alert" className="alerte erreur">{etat.erreur}</p>}
      <div className="champ">
        <label htmlFor="email">Adresse email</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="vous@entreprise.ci" />
      </div>
      <div className="champ">
        <label htmlFor="motDePasse">Mot de passe</label>
        <div className="champ-mdp">
          <input id="motDePasse" name="motDePasse" type={visible ? "text" : "password"} required maxLength={128}
            minLength={inscription ? 12 : undefined} autoComplete={inscription ? "new-password" : "current-password"}
            aria-describedby={inscription ? "aide-mdp" : undefined} />
          <button type="button" className="lien-icone" onClick={() => setVisible(!visible)}
            aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={visible}>
            <Oeil taille={18} />
          </button>
        </div>
        {inscription && <span id="aide-mdp" className="aide">12 caractères au moins. Une petite phrase est plus sûre et plus facile à retenir qu&apos;un mot compliqué.</span>}
        {!inscription && <Link href="/mot-de-passe-oublie" className="aide lien-oubli">Mot de passe oublié ?</Link>}
      </div>
      {inscription && (
        <label className="case">
          <input type="checkbox" name="conditions" value="oui" required />
          <span>Je surveille uniquement mes propres services, ou ceux de mes clients avec leur accord.</span>
        </label>
      )}
      <button type="submit" className="bouton plein" disabled={enCours}>{enCours ? "Un instant…" : bouton}</button>
    </form>
  );
}
