import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { composer, composerGroupe, corpsWebhook, duree, emailHtml, regrouper, signatureWebhook, texteTelegram, type Envoi } from "./messages";

const base: Envoi = {
  id: "n1", canal: "email", type: "panne", contact_id: "c1", contact_nom: "Awa", email: "awa@b.ci", user_id: null,
  moniteur_id: "m1", moniteur_nom: "Paiement mobile money", moniteur_url: "https://paiement.b.ci", client_nom: "Boutique Exemple",
  incident_id: "i1", debut: "2026-10-29T14:00:00Z", fin: null, cause: "Délai dépassé", lieux: "abidjan,paris",
  escalade_niveau: 1, ssl_expire_le: null, dernier_ms: null, seuil_lent_ms: 1500, jeton: "ab".repeat(24),
};
const maintenant = new Date("2026-10-29T14:02:00Z");
const APP = "https://app.alerterobot.test";

describe("composer", () => {
  it("dit quoi, depuis quand, d'où et quoi vérifier", () => {
    const m = composer(base, APP, maintenant);
    expect(m.corps).toBe("Paiement mobile money (Boutique Exemple) ne répond plus depuis 2 min. Délai dépassé. Confirmé depuis Abidjan et Paris.");
    expect(m.conseil).toContain("agrégateur");
    expect(m.lienVu).toBe(`${APP}/vu/${base.jeton}`);
  });

  it("donne la durée totale au rétablissement, sans bouton J'ai vu", () => {
    const m = composer({ ...base, type: "retabli", fin: "2026-10-29T14:23:00Z", jeton: null }, APP, maintenant);
    expect(m.corps).toContain("Durée de la panne : 23 min");
    expect(m.lienVu).toBeNull();
  });

  it("prévient de l'expiration du nom de domaine", () => {
    const m = composer({ ...base, type: "domaine", domaine: "boutique.ci", domaine_expire_le: "2026-11-05T12:00:00Z", jeton: null }, APP, maintenant);
    expect(m.objet).toBe("[DOMAINE] boutique.ci expire dans 7 jours");
    expect(m.corps).toContain("deviendra injoignable");
  });

  it("compte les jours avant l'expiration du certificat", () => {
    const m = composer({ ...base, type: "ssl", ssl_expire_le: "2026-11-05T12:00:00Z" }, APP, maintenant);
    expect(m.objet).toContain("dans 7 jours");
  });
});

describe("regrouper", () => {
  it("fusionne les pannes simultanées d'un même contact, pas le reste", () => {
    const g = regrouper([
      base, { ...base, id: "n2", moniteur_nom: "Site web", jeton: "cd".repeat(24) },
      { ...base, id: "n3", canal: "push" }, { ...base, id: "n4", type: "retabli" },
    ]);
    expect(g.map((x) => x.length).sort()).toEqual([1, 1, 2]);
    const m = composerGroupe(g.find((x) => x.length === 2)!, APP, maintenant);
    expect(m.titre).toBe("2 services de Boutique Exemple en panne");
    expect(m.lienVu).toBe(`${APP}/vu/${"ab".repeat(24)}.${"cd".repeat(24)}`);
  });
});

describe("emailHtml", () => {
  it("échappe les noms saisis par les clients", () => {
    const html = emailHtml(composer({ ...base, moniteur_nom: "<script>alert(1)</script>" }, APP, maintenant), APP);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("intégrations", () => {
  const integration: Envoi = { ...base, canal: "webhook", contact_id: null, contact_nom: null, jeton: null, integration_id: "w1", integration_url: "https://hooks.test", integration_secret: "whsec_x" };

  it("signe le webhook comme le vérifiera le destinataire", () => {
    const corps = corpsWebhook(integration, APP, maintenant);
    const sig = signatureWebhook("whsec_x", corps, 1793370000);
    expect(sig).toBe(`t=1793370000,v1=${createHmac("sha256", "whsec_x").update(`1793370000.${corps}`).digest("hex")}`);
    const json = JSON.parse(corps);
    expect(json.evenement).toBe("panne");
    expect(json.incident.lieux).toEqual(["abidjan", "paris"]);
    expect(json.incident.lien).toBe(`${APP}/incidents/i1`);
  });

  it("ne regroupe jamais les envois aux intégrations", () => {
    expect(regrouper([integration, { ...integration, id: "n9", integration_id: "w2" }])).toHaveLength(2);
  });

  it("rédige un message Telegram court avec le lien de l'incident", () => {
    const t = texteTelegram({ ...integration, canal: "telegram" }, APP, maintenant);
    expect(t).toContain("Panne · Paiement mobile money");
    expect(t).toContain(`${APP}/incidents/i1`);
  });
});

describe("duree", () => {
  it.each([[60_000, "1 min"], [23 * 60_000, "23 min"], [65 * 60_000, "1 h 05"], [120 * 60_000, "2 h"]])("%d ms → %s", (ms, t) =>
    expect(duree(ms as number)).toBe(t));
});
