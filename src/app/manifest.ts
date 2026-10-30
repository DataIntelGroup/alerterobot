import type { MetadataRoute } from "next";

// Nécessaire pour l'ajout à l'écran d'accueil, condition des notifications push sur iPhone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AlerteRobot",
    short_name: "AlerteRobot",
    description: "Surveillance de vos sites et alertes en cas de panne.",
    start_url: "/tableau-de-bord",
    display: "standalone",
    background_color: "#f4f6fa",
    theme_color: "#ffffff",
    lang: "fr",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
