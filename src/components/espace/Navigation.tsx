"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Logo } from "@/components/Logo";
import { Bulle, Cadenas, Chrono, Code, Document, Globe, Maison, Points, Serveurs, Sortie } from "@/components/Icones";

const PRINCIPAUX = [
  { href: "/tableau-de-bord", texte: "Aujourd'hui", court: "Aujourd'hui", icone: <Maison taille={20} /> },
  { href: "/moniteurs", texte: "Mes services", court: "Services", icone: <Serveurs taille={20} /> },
  { href: "/alertes", texte: "Qui prévenir", court: "Prévenir", icone: <Bulle taille={20} /> },
  { href: "/pages-statut", texte: "Pages clients", court: "Pages", icone: <Globe taille={20} /> },
];
const SECONDAIRES = [
  { href: "/rapports", texte: "Rapports", icone: <Document taille={18} /> },
  { href: "/maintenances", texte: "Maintenances", icone: <Chrono taille={18} /> },
  { href: "/integrations", texte: "Intégrations", icone: <Code taille={18} /> },
  { href: "/reglages", texte: "Réglages", icone: <Cadenas taille={18} /> },
];

type Props = {
  orgNom: string;
  email: string;
  forfait: string;
  moniteurs: number;
  moniteursMax: number;
  incidents: number;
  deconnexion?: () => Promise<void>;
};

const FORFAITS: Record<string, string> = { decouverte: "Découverte", essentiel: "Essentiel", pro: "Pro", agence: "Agence" };

/** Onglets en haut (ordinateur) et en bas (téléphone), menu « Plus » et menu du compte. */
export function Navigation({ orgNom, email, forfait, moniteurs, moniteursMax, incidents, deconnexion }: Props) {
  const chemin = usePathname();
  const racine = useRef<HTMLDivElement>(null);
  const actif = (href: string) => chemin === href || chemin.startsWith(`${href}/`);
  const plusActif = SECONDAIRES.some((l) => actif(l.href));

  // Un menu ouvert se referme quand on change de page ou qu'on clique ailleurs.
  useEffect(() => {
    racine.current?.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"));
  }, [chemin]);
  useEffect(() => {
    const fermer = (e: MouseEvent) => {
      racine.current?.querySelectorAll("details[open]").forEach((d) => { if (!d.contains(e.target as Node)) d.removeAttribute("open"); });
    };
    document.addEventListener("click", fermer);
    return () => document.removeEventListener("click", fermer);
  }, []);

  const pastille = (classe = "pastille-menu") => incidents > 0
    ? <span className={classe} aria-label={`${incidents} incident${incidents > 1 ? "s" : ""} en cours`}>{incidents}</span>
    : null;
  const plus = (
    <div className="panneau">
      {SECONDAIRES.map((l) => (
        <Link key={l.href} href={l.href} aria-current={actif(l.href) ? "page" : undefined}>{l.icone}{l.texte}</Link>
      ))}
    </div>
  );
  const part = moniteursMax ? Math.min(100, Math.round((100 * moniteurs) / moniteursMax)) : 0;
  const plein = moniteurs >= moniteursMax;

  return (
    <div ref={racine} className="navigation">
      <header className="barre-haut">
        <Link href="/tableau-de-bord" className="lien-logo" aria-label="AlerteRobot, aujourd'hui"><Logo /></Link>
        <nav aria-label="Menu" className="onglets">
          {PRINCIPAUX.map((l) => (
            <Link key={l.href} href={l.href} aria-current={actif(l.href) ? "page" : undefined}>
              {l.texte}{l.href === "/tableau-de-bord" && pastille()}
            </Link>
          ))}
          <details className={`deroulant${plusActif ? " actif" : ""}`}>
            <summary>Plus</summary>
            {plus}
          </details>
        </nav>
        <details className="deroulant compte-menu">
          <summary aria-label={`Compte : ${orgNom}`}><span className="org">{orgNom}</span><span className="avatar" aria-hidden="true">{(orgNom.trim()[0] ?? "A").toUpperCase()}</span></summary>
          <div className="panneau">
            <div className="qui">
              <strong>{orgNom}</strong>
              <span className="pale" title={email}>{email}</span>
              <div className="forfait-ligne"><span>Forfait {FORFAITS[forfait] ?? forfait}</span><span className="mono">{moniteurs} / {moniteursMax} services</span></div>
              <svg className="jauge" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
                <rect width="100" height="6" rx="3" fill="#ede6da" />
                <rect width={Math.max(part, 2)} height="6" rx="3" fill={plein ? "#e59a1a" : "#22a06b"} />
              </svg>
              {forfait !== "agence" && <Link href="/#tarifs">{plein ? "Passer au forfait supérieur" : "Voir les forfaits"}</Link>}
            </div>
            <Link href="/reglages"><Cadenas taille={18} />Réglages de l&apos;organisation</Link>
            {deconnexion ? (
              <form action={deconnexion}><button type="submit"><Sortie taille={18} />Se déconnecter</button></form>
            ) : (
              <button type="button" disabled><Sortie taille={18} />Se déconnecter</button>
            )}
          </div>
        </details>
      </header>

      <nav aria-label="Menu principal" className="barre-bas">
        {PRINCIPAUX.map((l) => (
          <Link key={l.href} href={l.href} aria-current={actif(l.href) ? "page" : undefined}>
            {l.icone}{l.court}{l.href === "/tableau-de-bord" && pastille()}
          </Link>
        ))}
        <details className={`deroulant${plusActif ? " actif" : ""}`}>
          <summary><Points taille={20} />Plus</summary>
          {plus}
        </details>
      </nav>
    </div>
  );
}
