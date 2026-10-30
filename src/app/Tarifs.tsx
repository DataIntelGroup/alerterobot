"use client";

import Link from "next/link";
import { useState } from "react";
import { Coche } from "@/components/Icones";

const FORFAITS = [
  { nom: "Découverte", pour: "Pour tester sans risque", mois: "0", an: "0", cta: "Commencer",
    atouts: ["1 moniteur", "Vérification toutes les 5 min", "Alertes email et push", "SSL, historique 7 jours"] },
  { nom: "Essentiel", pour: "Petit e-commerçant", mois: "5 000", an: "50 000", sans: "60 000", cta: "Choisir Essentiel",
    atouts: ["5 moniteurs", "Vérification toutes les 3 min", "Alertes email et push", "SSL, domaine, mot-clé", "Rapport mensuel"] },
  { nom: "Pro", pour: "SaaS, startup, e-commerce actif", mois: "15 000", an: "150 000", sans: "180 000", vedette: true, cta: "Choisir Pro",
    atouts: ["20 moniteurs", "Vérification chaque minute", "Alertes, rappels et escalade", "API, heartbeat, paiement mobile money", "Page de statut publique", "3 contacts"] },
  { nom: "Agence", pour: "Agences web, freelances", mois: "40 000", an: "400 000", sans: "480 000", cta: "Choisir Agence",
    atouts: ["100 moniteurs", "Vérification chaque minute", "Tout le forfait Pro", "Un espace par client", "Rapport mensuel par client", "10 contacts"] },
];

export function Tarifs() {
  const [annuel, setAnnuel] = useState(false);
  return (
    <>
      <div className="v-bascule" role="group" aria-label="Période de paiement">
        <button type="button" aria-pressed={!annuel} onClick={() => setAnnuel(false)}>Mensuel</button>
        <button type="button" aria-pressed={annuel} onClick={() => setAnnuel(true)}>Annuel · 2 mois offerts</button>
      </div>
      <div className="v-tarifs">
        {FORFAITS.map((f) => {
          const gratuit = f.mois === "0";
          return (
            <div key={f.nom} className={`v-tarif${f.vedette ? " vedette" : ""}`}>
              <div className="v-tarif-tete">
                <h3>{f.nom}</h3>
                {f.vedette && <span className="v-etiquette">Recommandé</span>}
              </div>
              <p className="v-pour">{f.pour}</p>
              <p className="v-prix"><strong>{annuel ? f.an : f.mois}</strong><span>FCFA / {annuel ? "an" : "mois"}</span></p>
              <p className="v-note">
                {gratuit ? "Gratuit, sans limite de durée" : annuel ? `au lieu de ${f.sans} FCFA` : `ou ${f.an} FCFA par an`}
              </p>
              <ul>
                {f.atouts.map((a) => <li key={a} className="v-coche"><Coche />{a}</li>)}
              </ul>
              <Link href="/inscription" className={`bouton${f.vedette ? "" : " secondaire"}`}>{f.cta}</Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
