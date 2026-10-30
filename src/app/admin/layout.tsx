import type { Metadata } from "next";
import Link from "next/link";
import { gardeAdmin } from "@/lib/admin";
import { Logo } from "@/components/Logo";
import { OngletsAdmin } from "./OngletsAdmin";

export const metadata: Metadata = { title: { default: "Administration", template: "%s · Administration" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await gardeAdmin();
  return (
    <div className="coque">
      <aside className="menu">
        <Logo />
        <p className="pale">Administration de la plateforme</p>
        <OngletsAdmin />
        <div className="forfait">
          <p className="pale">Connecté en tant que {admin.email}</p>
          <Link href="/tableau-de-bord">Mon espace client</Link>
        </div>
      </aside>
      <main className="contenu">{children}</main>
    </div>
  );
}
