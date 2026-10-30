// Service worker AlerteRobot : affiche les alertes push et gère « J'ai vu ».
// Le contenu arrive chiffré (Web Push) et n'est affiché que s'il vient de notre serveur.

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = {}; }
  const titre = typeof d.titre === "string" ? d.titre.slice(0, 120) : "AlerteRobot";
  const actions = d.lienVu ? [{ action: "vu", title: "J'ai vu" }, { action: "detail", title: "Voir le détail" }] : [];
  event.waitUntil(self.registration.showNotification(titre, {
    body: typeof d.corps === "string" ? d.corps.slice(0, 400) : "",
    tag: typeof d.tag === "string" ? d.tag : undefined,
    renotify: true,
    requireInteraction: Boolean(d.lienVu),
    icon: "/icon.svg",
    data: { url: d.url, lienVu: d.lienVu },
    actions,
  }));
});

// N'ouvre que des pages de notre propre origine, quel que soit le contenu reçu.
function interne(url) {
  try {
    const u = new URL(url, self.location.origin);
    return u.origin === self.location.origin ? u.href : self.location.origin + "/tableau-de-bord";
  } catch { return self.location.origin + "/tableau-de-bord"; }
}

self.addEventListener("notificationclick", (event) => {
  const { url, lienVu } = event.notification.data || {};
  event.notification.close();
  if (event.action === "vu" && lienVu) {
    const jetons = new URL(interne(lienVu)).pathname.split("/").pop();
    event.waitUntil(
      fetch("/api/vu", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jetons }) })
        .then((r) => r.json())
        .then((r) => self.registration.showNotification("AlerteRobot", {
          body: r.statut === "ok" || r.statut === "deja" ? "C'est noté. Les rappels sont arrêtés." : "Lien expiré : ouvrez l'incident depuis le tableau de bord.",
          icon: "/icon.svg",
        }))
        .catch(() => self.clients.openWindow(interne(lienVu))),
    );
    return;
  }
  // iPhone n'affiche pas les boutons : un appui ouvre la page « J'ai vu » ou le détail.
  event.waitUntil(self.clients.openWindow(interne(lienVu || url || "/tableau-de-bord")));
});
