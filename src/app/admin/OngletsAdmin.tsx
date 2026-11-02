"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ONGLETS = [
  { href: "/admin", texte: "Vue d'ensemble" },
  { href: "/admin/abonnes", texte: "Abonnés" },
  { href: "/admin/journal", texte: "Journal" },
];

export function OngletsAdmin() {
  const chemin = usePathname();
  return (
    <nav aria-label="Administration" className="onglets onglets-admin">
      {ONGLETS.map((o) => (
        <Link key={o.href} href={o.href} aria-current={chemin === o.href ? "page" : undefined}>{o.texte}</Link>
      ))}
    </nav>
  );
}
