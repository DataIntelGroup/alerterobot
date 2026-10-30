import type { Metadata } from "next";
import { espace } from "@/lib/session";
import { dateCourte } from "@/lib/format";
import { basculerIntegration, supprimerIntegration } from "../actions";
import { FormulaireTelegram, FormulaireWebhook } from "./FormulairesIntegration";

export const metadata: Metadata = { title: "Intégrations" };

type Integration = { id: string; type: "webhook" | "telegram"; nom: string; url: string | null; telegram_chat_id: number | null; actif: boolean; cree_le: string };

export default async function Integrations() {
  const { supabase, org } = await espace();
  // Le secret du webhook n'est pas lisible ici : les colonnes sont choisies une à une.
  const { data } = await supabase.from("integrations").select("id, type, nom, url, telegram_chat_id, actif, cree_le").eq("org_id", org.id).order("cree_le");
  const liste = (data ?? []) as Integration[];
  const gerer = org.role === "proprietaire" || org.role === "admin";
  const robot = process.env.TELEGRAM_BOT_NOM?.replace(/^@/, "") || null;

  return (
    <div className="etroit pile">
      <div>
        <h1>Intégrations</h1>
        <p className="doux">En plus des emails et des notifications, AlerteRobot peut prévenir un groupe Telegram ou vos propres outils par webhook. Elles reçoivent le début et la fin de chaque incident, les lenteurs et les alertes de certificat.</p>
      </div>

      {liste.length > 0 && (
        <section className="carte" aria-labelledby="titre-liste">
          <h2 id="titre-liste" className="carte-tete">Vos intégrations</h2>
          <ul className="liste-bascule">
            {liste.map((i) => {
              const enAttente = i.type === "telegram" && !i.telegram_chat_id;
              return (
                <li key={i.id}>
                  <div>
                    <span className={`etat ${enAttente ? "etat-inconnu" : i.actif ? "etat-ok" : "etat-inconnu"}`}>{i.nom}</span>
                    <p className="pale">
                      {i.type === "webhook" ? `Webhook · ${i.url}` : enAttente ? "Telegram · en attente de liaison" : "Telegram · groupe relié"} · depuis le {dateCourte(i.cree_le)}
                    </p>
                  </div>
                  {gerer && (
                    <div className="actions-ligne">
                      {!enAttente && (
                        <form action={basculerIntegration}>
                          <input type="hidden" name="id" value={i.id} />
                          {!i.actif && <input type="hidden" name="actif" value="oui" />}
                          <button type="submit" className="lien-bouton">{i.actif ? "Mettre en pause" : "Réactiver"}</button>
                        </form>
                      )}
                      <form action={supprimerIntegration}>
                        <input type="hidden" name="id" value={i.id} />
                        <button type="submit" className="lien-bouton">Supprimer</button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {gerer ? (
        <>
          <section className="carte pile" aria-labelledby="titre-telegram">
            <div>
              <h2 id="titre-telegram">Telegram</h2>
              <p className="pale">Toute l&apos;équipe voit l&apos;alerte au même endroit, même sans compte AlerteRobot.</p>
            </div>
            <FormulaireTelegram robot={robot} />
          </section>
          <section className="carte pile" aria-labelledby="titre-webhook">
            <div>
              <h2 id="titre-webhook">Webhook</h2>
              <p className="pale">Pour vos outils internes : chaque évènement arrive en JSON, signé par HMAC.</p>
            </div>
            <FormulaireWebhook />
          </section>
        </>
      ) : <p className="pale">Seul un administrateur de l&apos;organisation peut ajouter une intégration.</p>}
    </div>
  );
}
