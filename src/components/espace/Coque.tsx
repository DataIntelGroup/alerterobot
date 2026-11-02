import { Navigation } from "@/components/espace/Navigation";

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

/** Cadre de l'espace client : onglets en haut (en bas sur téléphone), contenu centré. */
export function Coque({ children, ...nav }: Props) {
  return (
    <div className="coque">
      <Navigation {...nav} />
      <main className="contenu">{children}</main>
    </div>
  );
}
