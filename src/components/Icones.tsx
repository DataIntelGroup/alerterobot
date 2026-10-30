// Icônes au trait, décoratives (aria-hidden) : le texte voisin porte le sens.
type Props = { taille?: number };

function Icone({ taille = 22, children, epaisseur = 1.8 }: Props & { children: React.ReactNode; epaisseur?: number }) {
  return (
    <svg aria-hidden="true" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={epaisseur} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const Coche = ({ taille = 16 }: Props) => <Icone taille={taille} epaisseur={2.4}><path d="m5 12 5 5 9-10" /></Icone>;
export const Globe = (p: Props) => <Icone {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Icone>;
export const Loupe = (p: Props) => <Icone {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></Icone>;
export const Chrono = (p: Props) => <Icone {...p}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></Icone>;
export const Cadenas = (p: Props) => <Icone {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icone>;
export const Serveurs = (p: Props) => <Icone {...p}><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></Icone>;
export const Code = (p: Props) => <Icone {...p}><path d="m8 7-5 5 5 5M16 7l5 5-5 5" /></Icone>;
export const Pouls = (p: Props) => <Icone {...p}><path d="M3 12h4l2-5 4 10 2-5h6" /></Icone>;
export const Telephone = (p: Props) => <Icone {...p}><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></Icone>;
export const Cloche = (p: Props) => <Icone {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" /></Icone>;
export const Grille = (p: Props) => <Icone {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Icone>;
export const Plus = (p: Props) => <Icone {...p} epaisseur={2.2}><path d="M12 5v14M5 12h14" /></Icone>;
export const Alerte = (p: Props) => <Icone {...p}><path d="M12 3 2 20h20zM12 10v4M12 17h.01" /></Icone>;
export const Personnes = (p: Props) => <Icone {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></Icone>;
export const Sortie = (p: Props) => <Icone {...p}><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11" /></Icone>;
export const Copier = (p: Props) => <Icone {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></Icone>;
export const Oeil = (p: Props) => <Icone {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icone>;
export const Bulle =(p: Props) => <Icone {...p}><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" /></Icone>;
