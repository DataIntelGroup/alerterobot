"use client";

import { useState } from "react";
import { Cloche } from "@/components/Icones";
import { enregistrerPush } from "../actions";

function cleEnOctets(base64: string): Uint8Array<ArrayBuffer> {
  const b = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const brut = atob(b);
  const octets = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets;
}

const MESSAGES = {
  ok: { texte: "C'est fait : ce téléphone recevra les alertes. Vous pouvez fermer cette page.", classe: "succes" },
  refuse: { texte: "Les notifications ont été refusées. Autorisez-les dans les réglages du navigateur pour ce site, puis réessayez.", classe: "erreur" },
  impossible: { texte: "Ce navigateur ne sait pas recevoir de notifications. Sur iPhone, ajoutez d'abord AlerteRobot à l'écran d'accueil. L'email reste envoyé dans tous les cas.", classe: "info" },
} as const;

export function ActiverPush({ cle }: { cle: string }) {
  const [etat, setEtat] = useState<"repos" | "encours" | keyof typeof MESSAGES>("repos");

  async function activer() {
    if (!cle || !("serviceWorker" in navigator) || !("PushManager" in window)) return setEtat("impossible");
    setEtat("encours");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setEtat("refuse");
      const sw = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const abonnement = (await sw.pushManager.getSubscription())
        ?? (await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleEnOctets(cle) }));
      const { ok } = await enregistrerPush(abonnement.toJSON());
      setEtat(ok ? "ok" : "impossible");
    } catch {
      setEtat("impossible");
    }
  }

  const message = etat in MESSAGES ? MESSAGES[etat as keyof typeof MESSAGES] : null;
  return (
    <div className="pile">
      {etat !== "ok" && (
        <button type="button" className="bouton" onClick={activer} disabled={etat === "encours"}>
          <Cloche taille={18} />{etat === "encours" ? "Activation…" : "Activer les notifications"}
        </button>
      )}
      <p role="status" className={message ? `alerte ${message.classe}` : "masque"}>{message?.texte}</p>
    </div>
  );
}
