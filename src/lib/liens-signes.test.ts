import { describe, expect, it } from "vitest";
import { signer, verifierJeton } from "./liens-signes";

const SECRET = "s".repeat(40);
const ID = "83b57b0e-ff6f-4d18-8fcf-feb29159c6e8";

describe("liens signés", () => {
  it("rend l'identifiant d'un jeton valide", () => {
    expect(verifierJeton("confirmer", signer("confirmer", ID, SECRET, 3600), SECRET)).toBe(ID);
  });
  it("refuse un jeton d'un autre objet", () => {
    expect(verifierJeton("confirmer", signer("desabonner", ID, SECRET), SECRET)).toBeNull();
  });
  it("refuse un jeton expiré", () => {
    const jeton = signer("confirmer", ID, SECRET, 60, Date.now() - 120_000);
    expect(verifierJeton("confirmer", jeton, SECRET)).toBeNull();
  });
  it("refuse un jeton modifié ou signé avec un autre secret", () => {
    const jeton = signer("desabonner", ID, SECRET);
    expect(verifierJeton("desabonner", jeton.slice(0, -2) + "xx", SECRET)).toBeNull();
    expect(verifierJeton("desabonner", jeton, "t".repeat(40))).toBeNull();
    expect(verifierJeton("desabonner", "n'importe.quoi", SECRET)).toBeNull();
  });
});
