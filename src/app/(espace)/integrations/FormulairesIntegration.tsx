"use client";

import { useActionState, useState } from "react";
import { Copier } from "@/components/Icones";
import { creerWebhook, lienTelegram } from "../actions";

function Copiable({ valeur, libelle }: { valeur: string; libelle: string }) {
  const [copie, setCopie] = useState(false);
  return (
    <>
      <div className="secret">
        <code>{valeur}</code>
        <button type="button" className="lien-icone" aria-label={`Copier ${libelle}`}
          onClick={() => navigator.clipboard?.writeText(valeur).then(() => setCopie(true), () => setCopie(false))}>
          <Copier taille={18} />
        </button>
      </div>
      {copie && <p role="status" className="pale">Copié.</p>}
    </>
  );
}

export function FormulaireWebhook() {
  const [etat, envoyer, enCours] = useActionState(creerWebhook, undefined);
  if (etat?.secret) {
    return (
      <div className="pile">
        <p className="alerte succes">Webhook créé. Voici son secret de signature : copiez-le maintenant, il ne sera plus affiché.</p>
        <Copiable valeur={etat.secret} libelle="le secret" />
        <p className="pale">Chaque envoi porte l&apos;en-tête <span className="code">AlerteRobot-Signature: t=…,v1=…</span>. Recalculez HMAC-SHA256 de « t.corps » avec ce secret, et refusez un horodatage de plus de 5 minutes.</p>
      </div>
    );
  }
  return (
    <form action={envoyer} className="formulaire">
      {etat?.erreur && <p role="alert" className="alerte erreur">{etat.erreur}</p>}
      <div className="grille-champs">
        <div className="champ">
          <label htmlFor="nom-webhook">Nom</label>
          <input id="nom-webhook" name="nom" required minLength={2} maxLength={80} placeholder="Slack de l'équipe" />
        </div>
        <div className="champ">
          <label htmlFor="url-webhook">Adresse (https)</label>
          <input id="url-webhook" name="url" type="url" required maxLength={2048} placeholder="https://hooks.exemple.ci/alerterobot" />
        </div>
      </div>
      <button type="submit" className="bouton secondaire" disabled={enCours}>{enCours ? "Création…" : "Créer le webhook"}</button>
    </form>
  );
}

export function FormulaireTelegram({ robot }: { robot: string | null }) {
  const [etat, envoyer, enCours] = useActionState(lienTelegram, undefined);
  if (!robot) return <p className="alerte info">Telegram sera disponible dès que le robot AlerteRobot sera configuré sur la plateforme.</p>;
  if (etat?.code) {
    const lien = `https://t.me/${robot}?startgroup=${etat.code}`;
    return (
      <div className="pile">
        <ol className="etapes-num">
          <li>Ouvrez ce lien sur votre téléphone et choisissez le groupe qui doit recevoir les alertes.</li>
          <li>Telegram ajoute le robot @{robot} au groupe : il confirme la liaison par un message.</li>
          <li>Rechargez cette page : le groupe apparaît dans la liste. Le lien est valable 15 minutes.</li>
        </ol>
        <a className="bouton" href={lien} target="_blank" rel="noopener noreferrer">Ouvrir Telegram</a>
        <p className="pale">Sur ordinateur, vous pouvez aussi envoyer <span className="code">/start {etat.code}</span> au robot dans le groupe.</p>
      </div>
    );
  }
  return (
    <form action={envoyer} className="formulaire">
      {etat?.erreur && <p role="alert" className="alerte erreur">{etat.erreur}</p>}
      <div className="champ">
        <label htmlFor="nom-telegram">Nom du groupe</label>
        <input id="nom-telegram" name="nom" minLength={2} maxLength={80} placeholder="Astreinte technique" />
      </div>
      <button type="submit" className="bouton secondaire" disabled={enCours}>{enCours ? "Un instant…" : "Relier un groupe Telegram"}</button>
    </form>
  );
}
