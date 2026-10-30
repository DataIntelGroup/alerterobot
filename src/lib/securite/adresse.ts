import { isIP } from "node:net";

/**
 * Garde contre le SSRF : AlerteRobot appelle des adresses saisies par ses
 * clients. Sans contrôle, un client pourrait faire interroger par nos workers
 * leur propre réseau interne (métadonnées du VPS, base, panneau d'admin).
 *
 * Deux niveaux : `verifierAdresse` contrôle l'URL à la saisie et à chaque
 * redirection ; `estIpPublique` contrôle chaque adresse IP résolue au moment
 * de la connexion (le DNS peut changer entre la saisie et la vérification).
 */

const PORTS_AUTORISES = new Set(["", "80", "443", "8080", "8443"]);
const SUFFIXES_INTERDITS = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa", ".corp"];

export type ResultatAdresse = { ok: true; url: URL } | { ok: false; raison: string };

export function verifierAdresse(brute: string): ResultatAdresse {
  let url: URL;
  try {
    url = new URL(brute.trim());
  } catch {
    return { ok: false, raison: "Adresse invalide." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, raison: "Seules les adresses http et https sont acceptées." };
  }
  if (url.username || url.password) {
    return { ok: false, raison: "Retirez l'identifiant et le mot de passe de l'adresse." };
  }
  if (!PORTS_AUTORISES.has(url.port)) {
    return { ok: false, raison: "Port non autorisé (80, 443, 8080 ou 8443)." };
  }
  const hote = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hote || hote === "localhost" || SUFFIXES_INTERDITS.some((s) => hote.endsWith(s))) {
    return { ok: false, raison: "Adresse interne refusée." };
  }
  if (isIP(hote)) {
    if (!estIpPublique(hote)) return { ok: false, raison: "Adresse interne refusée." };
  } else if (!hote.includes(".")) {
    return { ok: false, raison: "Indiquez un nom de domaine complet." };
  }
  if (url.href.length > 2048) {
    return { ok: false, raison: "Adresse trop longue." };
  }
  return { ok: true, url };
}

function ipv4EnNombre(ip: string): number {
  return ip.split(".").reduce((n, octet) => n * 256 + Number(octet), 0);
}

// Plages réservées (RFC 6890 et suivantes) : privé, boucle locale, lien local
// (dont les métadonnées cloud 169.254.169.254), CGNAT, multidiffusion, documentation.
const PLAGES_V4_RESERVEES: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function ipv4Publique(ip: string): boolean {
  const n = ipv4EnNombre(ip);
  return !PLAGES_V4_RESERVEES.some(([base, bits]) => {
    const masque = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((n & masque) >>> 0) === ((ipv4EnNombre(base) & masque) >>> 0);
  });
}

function ipv6EnMots(ip: string): number[] | null {
  let texte = ip.toLowerCase().split("%")[0];
  // Fin en notation IPv4 (::ffff:1.2.3.4) : convertie en deux mots de 16 bits.
  const v4 = texte.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = ipv4EnNombre(v4[1]);
    texte = texte.slice(0, -v4[1].length) + ((n >>> 16) & 0xffff).toString(16) + ":" + (n & 0xffff).toString(16);
  }
  const [gauche, droite] = texte.split("::");
  const g = gauche ? gauche.split(":") : [];
  const d = droite !== undefined ? (droite ? droite.split(":") : []) : [];
  const manquants = 8 - g.length - d.length;
  if (droite === undefined ? g.length !== 8 : manquants < 0) return null;
  const mots = [...g, ...Array(droite === undefined ? 0 : manquants).fill("0"), ...d].map((m) => parseInt(m, 16));
  return mots.length === 8 && mots.every((m) => Number.isInteger(m) && m >= 0 && m <= 0xffff) ? mots : null;
}

function ipv6Publique(ip: string): boolean {
  const m = ipv6EnMots(ip);
  if (!m) return false;
  if (m.every((x) => x === 0)) return false; // ::
  if (m.slice(0, 7).every((x) => x === 0) && m[7] === 1) return false; // ::1
  // IPv4 encapsulée (::ffff:a.b.c.d, ::a.b.c.d, 64:ff9b::a.b.c.d) : on juge l'IPv4.
  const v4 = `${m[6] >> 8}.${m[6] & 0xff}.${m[7] >> 8}.${m[7] & 0xff}`;
  if (m.slice(0, 5).every((x) => x === 0) && (m[5] === 0xffff || m[5] === 0)) return ipv4Publique(v4);
  if (m[0] === 0x64 && m[1] === 0xff9b) return ipv4Publique(v4);
  if ((m[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((m[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 lien local
  if ((m[0] & 0xff00) === 0xff00) return false; // ff00::/8 multidiffusion
  if (m[0] === 0x2001 && m[1] === 0x0db8) return false; // documentation
  if (m[0] === 0x2002) return ipv4Publique(`${m[1] >> 8}.${m[1] & 0xff}.${m[2] >> 8}.${m[2] & 0xff}`); // 6to4
  return (m[0] & 0xe000) === 0x2000; // seul 2000::/3 est routé publiquement
}

export function estIpPublique(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return ipv4Publique(ip);
  if (version === 6) return ipv6Publique(ip);
  return false;
}
