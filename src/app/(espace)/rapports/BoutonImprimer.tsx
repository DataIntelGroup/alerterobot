"use client";

export function BoutonImprimer() {
  return <button type="button" className="bouton secondaire" onClick={() => window.print()}>Télécharger en PDF</button>;
}
