import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Bulle, Cadenas, Chrono, Cloche, Coche, Code, Globe, Loupe, Pouls, Serveurs, Telephone } from "@/components/Icones";
import { Tarifs } from "./Tarifs";
import "./vitrine.css";

// Temps de réponse des 40 dernières vérifications du paiement : stable, puis 3 échecs.
const MESURES = [34, 38, 31, 36, 40, 33, 35, 30, 37, 42, 36, 34, 39, 33, 31, 38, 44, 36, 35, 40, 32, 37, 35, 41, 38, 34, 36, 46, 52, 48, 39, 36, 58, 64, 70, 78, 88, 100, 100, 100];

const VERIFICATIONS = [
  { icone: <Globe />, titre: "Disponibilité", texte: "Site injoignable, erreurs 500, 502, 503, délai dépassé." },
  { icone: <Loupe />, titre: "Mot-clé sur la page", texte: "La page répond mais affiche une erreur ou reste blanche." },
  { icone: <Chrono />, titre: "Temps de réponse", texte: "Lenteur au-dessus de votre seuil, ou nettement pire que d'habitude." },
  { icone: <Cadenas />, titre: "Certificat SSL", texte: "Certificat invalide, ou expiration dans 30, 7 et 1 jour." },
  { icone: <Serveurs />, titre: "Domaine et DNS", texte: "Domaine qui expire (alerte à 30, 7 et 1 jour), nom qui ne se résout plus." },
  { icone: <Code />, titre: "API", texte: "Endpoint en panne, code de retour inattendu, champ JSON manquant." },
  { icone: <Pouls />, titre: "Heartbeat", texte: "Sauvegarde, facturation ou envoi d'emails qui ne s'est pas exécuté." },
];

const DEROULE = [
  { heure: "14:00", titre: "Abidjan : échec", texte: "Délai dépassé (plus de 30 s) sur la page de paiement.", ton: "ambre" },
  { heure: "14:01", titre: "Paris revérifie : échec aussi", texte: "Deux lieux d'accord, la panne est confirmée.", ton: "rouge" },
  { heure: "14:02", titre: "Notification push et email", texte: "Awa reçoit l'alerte, avec quoi vérifier en premier.", ton: "rouge" },
  { heure: "14:17", titre: "Rappel", texte: "Toujours en panne. Moussa sera prévenu à 14:32 sans réponse.", ton: "rouge" },
  { heure: "14:19", titre: "Awa répond « J'ai vu »", texte: "Rappels arrêtés, escalade annulée.", ton: "gris" },
  { heure: "14:23", titre: "Rétabli", texte: "Message de fin : panne de 23 min, ajoutée au rapport d'octobre.", ton: "vert" },
];

const RAPPORT = [
  { nom: "Boutique Exemple", valeur: 99.95 },
  { nom: "Clinique Exemple", valeur: 100 },
  { nom: "École Exemple", valeur: 98.71 },
  { nom: "Immobilier Exemple", valeur: 99.98 },
];

const FAQ = [
  ["Faut-il installer quelque chose sur mon serveur ?", "Non. AlerteRobot vérifie vos services depuis l'extérieur, comme le ferait un client. Seul le heartbeat demande d'ajouter un appel d'adresse à la fin de vos tâches de fond."],
  ["Comment évitez-vous les fausses alertes ?", "Une panne doit être constatée depuis deux lieux différents, Abidjan et Paris, avant toute alerte. Les seuils de lenteur se règlent par moniteur."],
  ["Comment recevoir les notifications sur mon téléphone ?", "Ouvrez AlerteRobot sur votre téléphone, ajoutez-le à l'écran d'accueil et autorisez les notifications. Pas d'application à télécharger. Sur iPhone, il faut iOS 16.4 ou plus récent. L'email reste envoyé en secours."],
  ["Vais-je être réveillé la nuit ?", "Seulement pour les moniteurs que vous marquez critiques. Pendant vos heures silencieuses, le reste attend le matin, et rien n'est envoyé pendant une maintenance programmée."],
  ["Comment payer l'abonnement ?", "Par Wave, Orange Money, MTN MoMo ou carte bancaire, au mois ou à l'année avec 2 mois offerts."],
  ["Puis-je surveiller n'importe quel site ?", "Non. Vous surveillez vos propres services, ou ceux de vos clients avec leur accord. C'est une condition d'utilisation."],
  ["Et si AlerteRobot tombe en panne ?", "Les vérifications tournent dans deux lieux indépendants, et AlerteRobot est lui-même surveillé par un outil externe."],
];

function GrapheMesures() {
  const largeur = 10;
  return (
    <svg viewBox={`0 0 ${MESURES.length * largeur} 56`} preserveAspectRatio="none" role="img"
      aria-label="Temps de réponse stables, puis trois échecs consécutifs">
      {MESURES.map((m, i) => {
        const h = Math.round(m * 0.56);
        const couleur = i >= 37 ? "#d64545" : m > 60 ? "#e59a1a" : "#22a06b";
        return <rect key={i} x={i * largeur} y={56 - h} width={largeur - 3} height={h} rx="1.5" fill={couleur} />;
      })}
    </svg>
  );
}

function Barre({ valeur }: { valeur: number }) {
  // Échelle 98–100 % : sur 0–100, toutes les barres paraîtraient pleines.
  const largeur = Math.max(4, Math.round(((valeur - 98) / 2) * 100));
  return (
    <svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
      <rect width="100" height="6" rx="3" fill="#e1e6ee" />
      <rect width={largeur} height="6" rx="3" fill={valeur < 99.5 ? "#e59a1a" : "#22a06b"} />
    </svg>
  );
}

export default function Accueil() {
  return (
    <div className="v">
      <header className="v-entete">
        <div className="v-cadre">
          <Link href="/" aria-label="AlerteRobot, accueil"><Logo /></Link>
          <nav className="v-nav" aria-label="Navigation principale">
            <a href="#verifications">Vérifications</a>
            <a href="#alertes">Alertes</a>
            <a href="#agences">Agences</a>
            <a href="#tarifs">Tarifs</a>
            <a href="#questions">Questions</a>
          </nav>
          <div className="v-entete-actions">
            <Link href="/connexion" className="v-lien-discret">Connexion</Link>
            <Link href="/inscription" className="bouton">Essai gratuit</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="v-cadre v-hero">
          <div className="v-hero-texte">
            <p className="v-badge"><span className="v-point" />Vérifié depuis Abidjan et Paris, 24 h/24</p>
            <h1>Sachez que votre site est en panne avant vos clients.</h1>
            <p className="v-hero-intro v-texte">
              AlerteRobot vérifie vos sites, SaaS, API et paiements mobile money toutes les 1 à 5 minutes.
              Si quelque chose casse, vous recevez une notification sur votre téléphone et un email en français clair, en moins de 5 minutes.
            </p>
            <form className="v-essai" action="/inscription" method="get">
              <label htmlFor="adresse-essai" className="masque">Adresse à surveiller</label>
              <input id="adresse-essai" name="adresse" type="url" placeholder="https://votre-site.ci" inputMode="url" />
              <button type="submit" className="bouton">Surveiller gratuitement</button>
            </form>
            <p className="v-petit">1 moniteur gratuit, alertes email et push comprises, sans carte bancaire. Forfaits dès 5 000 FCFA/mois, payables par Wave, Orange Money ou MTN MoMo.</p>
            <ul className="v-preuves">
              <li><Coche />Panne confirmée depuis 2 lieux</li>
              <li><Coche />Rien à installer</li>
              <li><Coche />Prix en FCFA</li>
            </ul>
          </div>

          <div className="v-produit" aria-label="Aperçu du tableau de bord">
            <div className="v-produit-tete"><strong>Vos moniteurs</strong><span className="mono pale">vérifié il y a 12 s</span></div>
            <ul className="v-moniteurs">
              <li><span className="v-point" /><span className="nom">boutique-exemple.ci</span><span className="mesure">318 ms</span></li>
              <li className="panne"><span className="v-point rouge" /><span className="nom">Paiement mobile money</span><span className="mesure rouge">en panne · 2 min</span></li>
              <li><span className="v-point ambre" /><span className="nom">api.ecole-exemple.ci</span><span className="mesure ambre">lent · 2,8 s</span></li>
              <li><span className="v-point" /><span className="nom">Sauvegarde nocturne</span><span className="mesure">signal reçu 03:00</span></li>
            </ul>
            <div className="v-graphe">
              <div className="v-graphe-tete"><span>Paiement mobile money · 40 dernières vérifications</span><span className="mono">1 / min</span></div>
              <GrapheMesures />
              <div className="v-graphe-pied"><span>13:22</span><span>14:02</span></div>
            </div>
            <div className="v-notif">
              <Cloche taille={20} />
              <div>
                <strong>Notification push et email envoyés à 14:02</strong>
                <p>Paiement mobile money ne répond plus depuis 2 min. Confirmé depuis Abidjan et Paris. À vérifier : votre agrégateur (CinetPay).</p>
              </div>
            </div>
          </div>
        </section>

        <section className="v-integrations" aria-label="Compatible avec">
          <div className="v-cadre">
            <strong>Fonctionne avec</strong>
            {["WordPress", "WooCommerce", "Shopify", "API REST", "Supabase", "CinetPay", "PayDunya", "Hub2", "Wave", "Orange Money", "MTN MoMo"].map((n) => <span key={n}>{n}</span>)}
          </div>
        </section>

        <section className="v-cadre v-section" aria-labelledby="titre-probleme">
          <p className="v-sur">Le problème</p>
          <h2 id="titre-probleme" className="v-h2">Une panne coûte des ventes. Ne pas la voir coûte davantage.</h2>
          <div className="v-grille">
            <div className="v-carte"><h3>Vous l&apos;apprenez par vos clients</h3><p>Sans surveillance, la panne est signalée par un client mécontent, souvent des heures plus tard. Personne ne regarde la nuit ni le week-end.</p></div>
            <div className="v-carte"><h3>Le site marche, le paiement non</h3><p>Quand l&apos;agrégateur mobile money ne répond plus, la boutique s&apos;affiche normalement mais personne ne peut payer.</p></div>
            <div className="v-carte"><h3>Les outils étrangers sonnent faux</h3><p>Vérifiés depuis l&apos;étranger, vos sites semblent tomber à chaque incident sur les câbles sous-marins. On finit par couper les alertes.</p></div>
          </div>
          <figure className="v-citation">
            <blockquote>Fin août 2026, une perturbation d&apos;Orange Money Sénégal chez Flutterwave a bloqué encaissements et reversements pendant environ 13 heures.</blockquote>
            <figcaption>Source : IsDown</figcaption>
          </figure>
        </section>

        <section className="v-cadre v-section" aria-labelledby="titre-etapes">
          <p className="v-sur">Comment ça marche</p>
          <h2 id="titre-etapes" className="v-h2">Opérationnel en 30 secondes. Rien à installer.</h2>
          <ol className="v-etapes">
            <li><span className="num">01</span><h3>Collez votre adresse</h3><p>Un site, une API, une page de paiement ou l&apos;adresse heartbeat d&apos;une tâche de fond.</p></li>
            <li><span className="num">02</span><h3>Vérifié toutes les 1 à 5 min</h3><p>Depuis Abidjan et Paris, au rythme de votre forfait.</p></li>
            <li><span className="num">03</span><h3>Panne confirmée, vous êtes alerté</h3><p>Les deux lieux doivent échouer avant la notification push et l&apos;email.</p></li>
            <li><span className="num">04</span><h3>Rétabli, c&apos;est noté</h3><p>Message de fin avec la durée. L&apos;incident rejoint votre rapport mensuel.</p></li>
          </ol>
        </section>

        <section id="verifications" className="v-cadre v-section" aria-labelledby="titre-verifications">
          <div className="v-titre-ligne">
            <div>
              <p className="v-sur">Vérifications</p>
              <h2 id="titre-verifications" className="v-h2">Huit façons de détecter un problème.</h2>
            </div>
            <p className="v-texte">Chaque alerte dit ce qui ne va pas, depuis quand, et quoi vérifier en premier.</p>
          </div>
          <div className="v-grille">
            {VERIFICATIONS.map((v) => <div key={v.titre} className="v-carte">{v.icone}<h3>{v.titre}</h3><p>{v.texte}</p></div>)}
            <div className="v-carte accent"><Telephone /><h3>Paiement mobile money</h3><p>Page ou API de CinetPay, PayDunya, Hub2, Wave, Orange Money indisponible, ou incident publié par l&apos;agrégateur.</p></div>
          </div>
          <p className="v-bientot">Bientôt : parcours simulés (connexion, achat test), agent serveur, alertes business (« aucune commande depuis 6 h »).</p>
        </section>

        <section id="alertes" className="v-cadre v-section" aria-labelledby="titre-alertes">
          <div className="v-bloc">
            <div>
              <p className="v-sur">Alertes</p>
              <h2 id="titre-alertes" className="v-h2">Une alerte fiable sur votre téléphone, pas un code d&apos;erreur.</h2>
              <p className="v-texte">Une notification push avec un bouton « J&apos;ai vu », doublée d&apos;un email pour garder une trace. Une seule fausse alerte suffit à ce qu&apos;on ne lise plus les suivantes : AlerteRobot ne vous dérange que lorsque la panne est confirmée depuis deux lieux.</p>
              <ul className="v-liste">
                <li className="v-coche"><Coche taille={18} />Rappels toutes les 15 ou 30 minutes tant que la panne dure</li>
                <li className="v-coche"><Coche taille={18} />Escalade au contact suivant si personne ne répond en 30 minutes</li>
                <li className="v-coche"><Coche taille={18} />Plusieurs moniteurs en panne : une seule alerte groupée</li>
                <li className="v-coche"><Coche taille={18} />Maintenances et heures silencieuses : la nuit, seules les pannes critiques vous réveillent</li>
              </ul>
              <p className="v-pastille"><strong>Bientôt</strong>Alertes WhatsApp, SMS et appel vocal</p>
            </div>
            <div>
              <h3>Déroulé d&apos;un vrai incident · paiement.boutique-exemple.ci</h3>
              <ol className="v-chrono">
                {DEROULE.map((d) => (
                  <li key={d.heure} className={d.ton}>
                    <span className="rail" />
                    <div className="corps"><span className="heure">{d.heure}</span><strong>{d.titre}</strong><p>{d.texte}</p></div>
                  </li>
                ))}
              </ol>
              <p className="v-encart">Si Paris avait réussi à 14:01 : aucune alerte. Le souci venait du réseau local, pas de votre site.</p>
            </div>
          </div>
        </section>

        <section id="agences" className="v-cadre v-section v-agence" aria-labelledby="titre-agences">
          <div className="v-rapport">
            <div className="v-rapport-tete">
              <div><strong>Rapport d&apos;octobre</strong><p className="pale">Agence Exemple · disponibilité par client</p></div>
              <span className="mono pale">échelle 98–100 %</span>
            </div>
            <ul>
              {RAPPORT.map((r) => (
                <li key={r.nom}>
                  <div><span>{r.nom}</span><span className={`valeur ${r.valeur < 99.5 ? "ambre" : "vert"}`}>{r.valeur.toLocaleString("fr-FR")} %</span></div>
                  <Barre valeur={r.valeur} />
                </li>
              ))}
            </ul>
            <p className="pale">7 incidents ce mois · durée médiane 14 min · 0 fausse alerte</p>
            <div className="v-rapport-actions">
              <span className="bouton secondaire" aria-hidden="true">Télécharger le PDF</span>
              <span className="bouton" aria-hidden="true">Envoyer aux 6 clients</span>
            </div>
          </div>
          <div>
            <p className="v-sur">Mode agence</p>
            <h2 id="titre-agences" className="v-h2">Tous vos sites clients. Un seul tableau de bord.</h2>
            <p className="v-texte">Prévenez vos clients avant qu&apos;ils ne vous appellent, et prouvez chaque mois la qualité de votre maintenance.</p>
            <div className="v-atouts">
              <div><h3>Un espace par client</h3><p>Moniteurs, contacts et alertes séparés.</p></div>
              <div><h3>Rapport mensuel prêt</h3><p>Disponibilité et incidents, à envoyer tel quel.</p></div>
              <div><h3>Page de statut</h3><p>Une page publique par client.</p></div>
              <div><h3>100 moniteurs</h3><p>Vérifiés chaque minute, 10 contacts.</p></div>
            </div>
          </div>
        </section>

        <section id="tarifs" className="v-cadre v-section v-centre" aria-labelledby="titre-tarifs">
          <p className="v-sur">Tarifs de lancement</p>
          <h2 id="titre-tarifs" className="v-h2">Des prix en FCFA, payables par mobile money.</h2>
          <Tarifs />
          <p className="v-tarifs-pied">Moniteurs supplémentaires par paquets de 10 · Wave, Orange Money, MTN MoMo ou carte · Sans engagement</p>
        </section>

        <section id="questions" className="v-cadre v-section v-faq" aria-labelledby="titre-faq">
          <h2 id="titre-faq" className="v-h2">Questions fréquentes</h2>
          <div>
            {FAQ.map(([q, r], i) => (
              <details key={q} open={i === 0}>
                <summary>{q}</summary>
                <p>{r}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="v-cadre" aria-labelledby="titre-final">
          <div className="v-final">
            <h2 id="titre-final">Votre prochaine panne, vous la saurez en premier.</h2>
            <p>Premier moniteur gratuit. Opérationnel en 30 secondes.</p>
            <div className="actions">
              <Link href="/inscription" className="bouton">Surveiller mon site gratuitement</Link>
              <Link href="/connexion" className="bouton secondaire"><Bulle taille={18} />J&apos;ai déjà un compte</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="v-pied">
        <div className="v-cadre">
          <span>AlerteRobot · Une solution Data Intelligence Group · Abidjan</span>
          <nav aria-label="Pied de page">
            <a href="#tarifs">Tarifs</a>
            <a href="#questions">Questions</a>
            <Link href="/connexion">Se connecter</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
