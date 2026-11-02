import type { Metadata } from "next";
import Link from "next/link";
import { espace } from "@/lib/session";
import { FormulaireMoniteur } from "./FormulaireMoniteur";

export const metadata: Metadata = { title: "Ajouter un moniteur" };

export default async function NouveauMoniteur({ searchParams }: { searchParams: Promise<{ bienvenue?: string }> }) {
  const { supabase, org } = await espace();
  const { bienvenue } = await searchParams;
  const [{ data: clients }, { count }] = await Promise.all([
    supabase.from("clients").select("id, nom").eq("org_id", org.id).order("nom"),
    supabase.from("moniteurs").select("id", { count: "exact", head: true }).eq("org_id", org.id),
  ]);
  const plein = (count ?? 0) >= org.moniteurs_max;
  const appUrl = (process.env.APP_URL ?? "http://localhost:3500").replace(/\/$/, "");
  return (
    <div className="etroit pile">
      {!bienvenue && <Link className="retour" href="/tableau-de-bord">← Aujourd&apos;hui</Link>}
      <div>
        {bienvenue && <p className="pale">Étape 3 sur 3</p>}
        <h1>{bienvenue ? "Que voulez-vous surveiller en premier ?" : "Ajouter un moniteur"}</h1>
        <p className="doux">Collez une adresse. AlerteRobot la vérifie depuis Abidjan et Paris, et vous prévient dès qu&apos;une panne est confirmée.</p>
      </div>
      {plein ? (
        <div className="carte vide">
          <strong>Vous avez utilisé vos {org.moniteurs_max} moniteur{org.moniteurs_max > 1 ? "s" : ""}</strong>
          <p>Pour surveiller une adresse de plus, passez au forfait supérieur ou supprimez un moniteur que vous n&apos;utilisez plus.</p>
          <Link className="bouton" href="/#tarifs">Voir les forfaits</Link>
        </div>
      ) : (
        <FormulaireMoniteur clients={clients ?? []} forfait={org.forfait} appUrl={appUrl} />
      )}
    </div>
  );
}
