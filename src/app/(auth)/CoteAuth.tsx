import { Coche, Pouls } from "@/components/Icones";

/** Colonne de droite des pages de connexion : ce que la personne obtient, en clair. */
export function CoteAuth({ titre }: { titre: string }) {
  return (
    <aside className="auth-cote" aria-label="Ce que fait AlerteRobot">
      <h2>{titre}</h2>
      <div className="notif-exemple" aria-hidden="true">
        <div className="tete"><span className="ico"><Pouls taille={13} /></span><span>AlerteRobot</span><span>14:02</span></div>
        <p><strong><span className="rouge-txt">Panne</span> · Paiement mobile money</strong></p>
        <p>La page de paiement ne répond plus depuis 2 min. Confirmé depuis Abidjan et Paris. À vérifier : CinetPay.</p>
      </div>
      <ul>
        <li><Coche taille={18} /><div><strong>Prévenu en moins de 5 minutes</strong>Par notification sur votre téléphone, et par email.</div></li>
        <li><Coche taille={18} /><div><strong>Pas de fausse alerte</strong>Une panne doit être confirmée depuis Abidjan et Paris.</div></li>
        <li><Coche taille={18} /><div><strong>En français, en FCFA</strong>Un premier moniteur gratuit, sans carte bancaire.</div></li>
      </ul>
    </aside>
  );
}
