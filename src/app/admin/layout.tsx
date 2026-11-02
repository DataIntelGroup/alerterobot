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
      <header className="barre-haut">
        <Logo />
        <OngletsAdmin />
        <div className="admin-qui">
          <span className="pale" title={admin.email}>Administration · {admin.email}</span>
          <Link href="/tableau-de-bord">Mon espace client</Link>
        </div>
      </header>
      <main className="contenu">{children}</main>
    </div>
  );
}
