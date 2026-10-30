import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

// Polices téléchargées au build et servies par le site : aucune requête vers Google
// depuis le navigateur, la CSP (font-src 'self') reste stricte.
// Une seule famille, arrondie et lisible, pour les titres comme pour le texte ;
// la chasse fixe est réservée à ce qu'on copie (commandes, adresses, extraits).
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--police-texte", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500"], variable: "--police-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "AlerteRobot · Surveillance de sites et paiements mobile money", template: "%s · AlerteRobot" },
  description: "AlerteRobot vérifie vos sites, API et paiements mobile money depuis Abidjan et Paris, et vous prévient par notification et email en moins de 5 minutes.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Lire l'en-tête rend chaque page dynamique : indispensable pour un nonce CSP par requête.
  await headers();
  return (
    <html lang="fr" className={`${jakarta.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
