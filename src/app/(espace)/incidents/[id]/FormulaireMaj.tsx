"use client";

import { useActionState, useRef } from "react";
import { publierMaj } from "../../actions";

const ETAPES = [
  ["analyse", "En cours d'analyse"],
  ["identifie", "Cause identifiée"],
  ["surveillance", "Correctif appliqué, sous surveillance"],
  ["resolu", "Résolu"],
] as const;

export function FormulaireMaj({ incident, etapeConseillee }: { incident: string; etapeConseillee: string }) {
  const formulaire = useRef<HTMLFormElement>(null);
  const [etat, envoyer, enCours] = useActionState(async (avant: Parameters<typeof publierMaj>[0], form: FormData) => {
    const r = await publierMaj(avant, form);
    if (r?.ok) formulaire.current?.reset();
    return r;
  }, undefined);
  return (
    <form ref={formulaire} action={envoyer} className="formulaire">
      <input type="hidden" name="incident" value={incident} />
      {etat?.erreur && <p role="alert" className="alerte erreur">{etat.erreur}</p>}
      {etat?.ok && <p role="status" className="alerte succes">{etat.ok}</p>}
      <div className="champ">
        <label htmlFor="etape">Où en êtes-vous ?</label>
        <select id="etape" name="etape" defaultValue={etapeConseillee}>
          {ETAPES.filter(([v]) => v !== "resolu" || etapeConseillee === "resolu").map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </div>
      <div className="champ">
        <label htmlFor="message">Message pour vos clients</label>
        <textarea id="message" name="message" required minLength={3} maxLength={1000} rows={3}
          placeholder="Notre prestataire de paiement ne répond plus. Vos commandes sont enregistrées : vous pourrez les payer dès le retour du service." />
        <span className="aide">Écrivez simplement : ce qui se passe, ce que vous faites, ce que vos clients doivent savoir.</span>
      </div>
      <label className="case">
        <input type="checkbox" name="publique" value="oui" defaultChecked />
        <span>Publier sur la page de statut et prévenir les abonnés par email</span>
      </label>
      <button type="submit" className="bouton" disabled={enCours}>{enCours ? "Publication…" : "Publier la mise à jour"}</button>
    </form>
  );
}
