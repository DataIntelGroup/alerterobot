"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bulle, Cadenas, Chrono, Code, Globe, Grille, Plus, Serveurs } from "@/components/Icones";

export function MenuLiens({ incidents = 0 }: { incidents?: number }) {
  const chemin = usePathname();
  const liens = [
    { href: "/tableau-de-bord", texte: "Vue d'ensemble", icone: <Grille taille={18} />, pastille: incidents },
    { href: "/moniteurs/nouveau", texte: "Ajouter un moniteur", icone: <Plus taille={18} /> },
    { href: "/alertes", texte: "Contacts et alertes", icone: <Bulle taille={18} /> },
    { href: "/maintenances", texte: "Maintenances", icone: <Chrono taille={18} /> },
    { href: "/pages-statut", texte: "Pages de statut", icone: <Globe taille={18} /> },
    { href: "/rapports", texte: "Rapports", icone: <Serveurs taille={18} /> },
    { href: "/integrations", texte: "Intégrations", icone: <Code taille={18} /> },
    { href: "/reglages", texte: "Réglages", icone: <Cadenas taille={18} /> },
  ];
  return (
    <nav aria-label="Menu" className="menu-liens">
      {liens.map((l) => (
        <Link key={l.href} href={l.href} aria-current={chemin.startsWith(l.href) ? "page" : undefined}>
          {l.icone}
          <span>{l.texte}</span>
          {l.pastille ? <span className="pastille-menu" aria-label={`${l.pastille} incident${l.pastille > 1 ? "s" : ""} en cours`}>{l.pastille}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
