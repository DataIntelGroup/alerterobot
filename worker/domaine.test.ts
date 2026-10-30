import { describe, expect, it } from "vitest";
import { domaineEnregistrable, expirationRdap } from "./domaine";

describe("domaineEnregistrable", () => {
  it.each([
    ["www.exemple.com", "exemple.com"],
    ["api.boutique.co.ci", "boutique.co.ci"],
    ["paiement.boutique-exemple.ci", "boutique-exemple.ci"],
    ["mairie.gouv.ci", "mairie.gouv.ci"],
    ["exemple.fr.", "exemple.fr"],
  ])("%s → %s", (hote, attendu) => expect(domaineEnregistrable(hote)).toBe(attendu));

  it.each(["8.8.8.8", "[2a00:1450::1]", "localhost"])("ignore %s", (hote) => expect(domaineEnregistrable(hote)).toBeNull());
});

describe("expirationRdap", () => {
  it("lit l'évènement d'expiration", () => {
    const json = { events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }, { eventAction: "expiration", eventDate: "2027-03-15T10:00:00Z" }] };
    expect(expirationRdap(json)?.toISOString()).toBe("2027-03-15T10:00:00.000Z");
  });
  it("renvoie null sans date fiable", () => {
    expect(expirationRdap({ events: [{ eventAction: "expiration", eventDate: "n'importe quoi" }] })).toBeNull();
    expect(expirationRdap({})).toBeNull();
  });
});
