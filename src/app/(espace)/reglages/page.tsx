import type { Metadata } from "next";
import { espace } from "@/lib/session";
import { FormulaireReglages } from "./FormulaireReglages";

export const metadata: Metadata = { title: "Réglages" };

export default async function Reglages() {
  const { supabase, org } = await espace();
  const { data: o } = await supabase.from("organisations").select("nom, rappel_min, escalade_min, silence_debut, silence_fin").eq("id", org.id).single();
  const gerer = org.role === "proprietaire" || org.role === "admin";
  return (
    <div className="etroit pile">
      <div>
        <h1>Réglages</h1>
        <p className="doux">Le rythme des rappels, le délai avant de prévenir le contact suivant, et vos heures de tranquillité.</p>
      </div>
      <section className="carte">
        {o && gerer ? <FormulaireReglages o={o} /> : <p className="pale">Seul un administrateur de l&apos;organisation peut modifier ces réglages.</p>}
      </section>
    </div>
  );
}
