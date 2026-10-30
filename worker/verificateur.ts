import { arretDemande, attendre, base, journal } from "./base.ts";
import { expirationCertificat, verifier, type Moniteur } from "./sonde.ts";
import { domaineEnregistrable, lireExpiration } from "./domaine.ts";

/**
 * Worker de vérification d'un lieu : `node worker/verificateur.ts abidjan`.
 * À déployer sur un VPS par lieu (Afrique de l'Ouest, Europe). Il réserve les
 * vérifications dues, les exécute en parallèle et transmet les résultats au
 * moteur SQL, qui décide seul de l'état et des alertes.
 */

const lieu = process.argv[2];
if (lieu !== "abidjan" && lieu !== "paris") {
  console.error("Usage : node worker/verificateur.ts abidjan|paris");
  process.exit(1);
}

const PARALLELE = Number(process.env.WORKER_PARALLELE ?? 20);
const CERTIFICAT_TOUS_LES_MS = 12 * 3600 * 1000;
const certificatsLus = new Map<string, number>();
const DOMAINE_TOUS_LES_MS = 24 * 3600 * 1000;
const domainesLus = new Map<string, number>();
const db = base();
const arreter = arretDemande();

type Du = Moniteur & { moniteur_id: string };

async function traiter(m: Du) {
  const r = await verifier(m);
  let sslExpire: Date | null = null;
  const dernier = certificatsLus.get(m.moniteur_id) ?? 0;
  if (r.ok && m.url.startsWith("https:") && Date.now() - dernier > CERTIFICAT_TOUS_LES_MS) {
    sslExpire = await expirationCertificat(m.url);
    certificatsLus.set(m.moniteur_id, Date.now());
  }
  const { error } = await db.rpc("enregistrer_verification", {
    p_moniteur: m.moniteur_id, p_lieu: lieu, p_ok: r.ok, p_code: r.code, p_ms: r.ms, p_erreur: r.erreur,
    p_ssl_expire: sslExpire?.toISOString() ?? null,
    p_details: Object.keys(r.details).length ? r.details : null,
  });
  if (error) journal("erreur", "enregistrement refusé", { moniteur: m.moniteur_id, code: error.code });

  // Expiration du domaine : une lecture par jour et par moniteur, depuis un seul lieu.
  if (lieu === "paris" && Date.now() - (domainesLus.get(m.moniteur_id) ?? 0) > DOMAINE_TOUS_LES_MS) {
    domainesLus.set(m.moniteur_id, Date.now());
    const domaine = domaineEnregistrable(new URL(m.url).hostname);
    if (domaine) {
      const expire = await lireExpiration(domaine);
      await db.rpc("enregistrer_domaine", { p_moniteur: m.moniteur_id, p_domaine: domaine, p_expire: expire?.toISOString() ?? null });
    }
  }
}

async function tour(): Promise<number> {
  const { data, error } = await db.rpc("reserver_verifications", { p_lieu: lieu, p_limite: 100 });
  if (error) {
    journal("erreur", "réservation impossible", { code: error.code, message: error.message });
    return 0;
  }
  const dus = (data ?? []) as Du[];
  for (let i = 0; i < dus.length; i += PARALLELE) {
    await Promise.all(dus.slice(i, i + PARALLELE).map(traiter));
  }
  return dus.length;
}

journal("info", "worker démarré", { lieu, parallele: PARALLELE });
while (!arreter()) {
  const nb = await tour().catch((e) => { journal("erreur", "tour en échec", { erreur: String(e) }); return 0; });
  if (nb > 0) journal("info", "vérifications faites", { lieu, nb });
  await attendre(nb >= 100 ? 0 : 5000);
}
journal("info", "worker arrêté", { lieu });
