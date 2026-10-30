import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Sortie } from "@/components/Icones";
import { MenuLiens } from "@/app/(espace)/MenuLiens";

const FORFAITS: Record<string, string> = { decouverte: "Découverte", essentiel: "Essentiel", pro: "Pro", agence: "Agence" };

type Props = {
  orgNom: string;
  forfait: string;
  moniteurs: number;
  moniteursMax: number;
  email: string;
  incidents: number;
  deconnexion?: () => Promise<void>;
  children: React.ReactNode;
};

/** Cadre de l'espace client : menu à gauche (au-dessus sur téléphone), contenu à droite. */
export function Coque({ orgNom, forfait, moniteurs, moniteursMax, email, incidents, deconnexion, children }: Props) {
  const part = moniteursMax ? Math.min(100, Math.round((100 * moniteurs) / moniteursMax)) : 0;
  const plein = moniteurs >= moniteursMax;
  return (
    <div className="coque">
      <aside className="menu">
        <Link href="/tableau-de-bord" aria-label="Vue d'ensemble"><Logo /></Link>
        <p className="menu-org" title={orgNom}>{orgNom}</p>
        <MenuLiens incidents={incidents} />
        <div className="forfait">
          <div className="forfait-ligne"><strong>Forfait {FORFAITS[forfait] ?? forfait}</strong><span className="mono">{moniteurs} / {moniteursMax}</span></div>
          <svg className="jauge" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
            <rect width="100" height="6" rx="3" fill="#e1e6ee" />
            <rect width={Math.max(part, 2)} height="6" rx="3" fill={plein ? "#e59a1a" : "#22a06b"} />
          </svg>
          <p className="pale">
            {plein ? "Vous avez utilisé tous vos moniteurs." : `Encore ${moniteursMax - moniteurs} moniteur${moniteursMax - moniteurs > 1 ? "s" : ""} disponible${moniteursMax - moniteurs > 1 ? "s" : ""}.`}
            {forfait !== "agence" && <> <Link href="/#tarifs">Voir les forfaits</Link></>}
          </p>
          <div className="compte">
            <span className="pale" title={email}>{email}</span>
            {deconnexion ? (
              <form action={deconnexion}><button type="submit" className="lien-icone" aria-label="Se déconnecter" title="Se déconnecter"><Sortie taille={18} /></button></form>
            ) : (
              <span className="lien-icone" aria-hidden="true"><Sortie taille={18} /></span>
            )}
          </div>
        </div>
      </aside>
      <main className="contenu">{children}</main>
    </div>
  );
}
