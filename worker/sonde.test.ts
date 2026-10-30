import { describe, expect, it } from "vitest";
import { extrait, lireChamp } from "./sonde";

describe("extrait", () => {
  it("garde le texte lisible d'une page d'erreur", () => {
    const html = "<html><head><style>body{}</style><script>alert(1)</script></head><body><h1>502 Bad&nbsp;Gateway</h1>\n\n<p>nginx</p></body></html>";
    expect(extrait(html)).toBe("502 Bad Gateway nginx");
  });
  it("coupe à 500 caractères", () => {
    expect(extrait("a".repeat(2000))).toHaveLength(500);
  });
});

describe("lireChamp", () => {
  it("suit un chemin pointé sans lire le prototype", () => {
    expect(lireChamp({ data: { status: "ok" } }, "data.status")).toBe("ok");
    expect(lireChamp({ data: {} }, "data.status")).toBeUndefined();
    expect(lireChamp({}, "constructor")).toBeUndefined();
  });
});
