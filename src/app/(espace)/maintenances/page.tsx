import type { Metadata } from "next";
import { espace, peutEcrire } from "@/lib/session";
import { dateCourte, heure } from "@/lib/format";
import { supprimerMaintenance } from "../actions";
import { FormulaireMaintenance } from "./FormulaireMaintenance";

export const metadata: Metadata = { title: "Maintenances" };

export default async function Maintenances() {
  const { supabase, org } = await espace();
  const maintenant = new Date().toISOString();
  const [{ data: liste }, { data: moniteurs }] = await Promise.all([
    supabase.from("maintenances").select("id, debut, fin, motif, publique, moniteurs (nom)")
      .eq("org_id", org.id).gte("fin", new Date(Date.now() - 30 * 86400000).toISOString()).order("debut"),
    supabase.from("moniteurs").select("id, nom").eq("org_id", org.id).order("nom"),
  ]);
  const ecriture = peutEcrire(org.role);
  const aVenir = (liste ?? []).filter((m) => m.fin >= maintenant);
  const passees = (liste ?? []).filter((m) => m.fin < maintenant).reverse();

  const Ligne = ({ m }: { m: (typeof aVenir)[number] }) => {
    const enCours = m.debut <= maintenant && m.fin >= maintenant;
    const cible = (m.moniteurs as unknown as { nom: string } | null)?.nom ?? "Tous les services";
    return (
      <li className={enCours ? "bleu" : m.fin < maintenant ? "gris" : "ambre"}>
        <div className="ligne-action">
          <div>
            <strong>{cible}</strong>{enCours && <span className="pale"> · en cours</span>}
            <p className="pale">{dateCourte(m.debut)} {heure(m.debut)} → {dateCourte(m.fin)} {heure(m.fin)}{m.publique ? " · annoncée" : " · interne"}</p>
            {m.motif && <p className="pale">{m.motif}</p>}
          </div>
          {ecriture && m.fin >= maintenant && (
            <form action={supprimerMaintenance}>
              <input type="hidden" name="id" value={m.id} />
              <button type="submit" className="bouton secondaire">{enCours ? "Terminer" : "Annuler"}</button>
            </form>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="etroit pile">
      <div>
        <h1>Maintenances</h1>
        <p className="doux">Pendant une maintenance programmée, AlerteRobot continue de vérifier vos services mais n&apos;envoie aucune alerte. Annoncée, elle apparaît aussi sur vos pages de statut et part par email aux abonnés.</p>
      </div>
      {ecriture && (
        <section className="carte" aria-labelledby="titre-nouvelle">
          <h2 id="titre-nouvelle" className="carte-tete">Programmer une maintenance</h2>
          <FormulaireMaintenance moniteurs={moniteurs ?? []} />
        </section>
      )}
      <section className="carte" aria-labelledby="titre-avenir">
        <h2 id="titre-avenir" className="carte-tete">En cours et à venir</h2>
        {aVenir.length === 0 ? <p className="pale">Aucune maintenance prévue.</p> : <ul className="liste-points">{aVenir.map((m) => <Ligne key={m.id} m={m} />)}</ul>}
      </section>
      {passees.length > 0 && (
        <section className="carte" aria-labelledby="titre-passees">
          <h2 id="titre-passees" className="carte-tete">Ces 30 derniers jours</h2>
          <ul className="liste-points">{passees.map((m) => <Ligne key={m.id} m={m} />)}</ul>
        </section>
      )}
    </div>
  );
}
