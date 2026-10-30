import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function Introuvable() {
  return (
    <main className="centre">
      <div className="boite pile introuvable">
        <div><Logo /></div>
        <p className="code" aria-hidden="true">404</p>
        <div>
          <h1>Cette page n&apos;existe pas</h1>
          <p className="doux">Le lien est peut-être incomplet, ou la page a été déplacée. Pas d&apos;inquiétude : vos sites, eux, restent surveillés.</p>
        </div>
        <div className="actions">
          <Link className="bouton" href="/tableau-de-bord">Mon tableau de bord</Link>
          <Link className="bouton secondaire" href="/">Accueil</Link>
        </div>
      </div>
    </main>
  );
}
