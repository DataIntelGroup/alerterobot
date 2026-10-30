import { describe, expect, it } from "vitest";
import { estIpPublique, verifierAdresse } from "./adresse";

describe("estIpPublique", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "2001:db8::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "64:ff9b::a9fe:a9fe", "2002:c0a8:0101::1",
    "pas-une-ip",
  ])("refuse %s", (ip) => expect(estIpPublique(ip)).toBe(false));

  it.each(["8.8.8.8", "41.202.219.10", "172.32.0.1", "2a00:1450:4007:80e::200e", "::ffff:8.8.8.8"])(
    "accepte %s", (ip) => expect(estIpPublique(ip)).toBe(true));
});

describe("verifierAdresse", () => {
  it.each([
    ["ftp://site.ci", "http"],
    ["file:///etc/passwd", "http"],
    ["http://localhost:3000", "Port"],
    ["http://localhost/", "interne"],
    ["http://admin.localhost/", "interne"],
    ["http://127.0.0.1/", "interne"],
    ["http://[::1]/", "interne"],
    ["http://169.254.169.254/latest/meta-data/", "interne"],
    ["http://user:mdp@site.ci/", "identifiant"],
    ["https://site.ci:22/", "Port"],
    ["http://intranet/", "domaine"],
    ["pas une url", "invalide"],
  ])("refuse %s", (brute, motif) => {
    const r = verifierAdresse(brute);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toContain(motif);
  });

  it.each(["https://boutique-exemple.ci", "http://api.ecole.ci:8080/v1/cours?x=1", "https://8.8.8.8/"])(
    "accepte %s", (brute) => expect(verifierAdresse(brute).ok).toBe(true));
});
