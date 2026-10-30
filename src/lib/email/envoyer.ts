/**
 * Envoi d'un email par Resend. Partagé par Next et par le notifieur : aucun import ici.
 * Sans RESEND_API_KEY (développement), rien ne part : l'objet est écrit dans la console.
 */

export type Email = { a: string; sujet: string; html: string; texte: string; desabonnement?: string };

export async function envoyerEmail(e: Email): Promise<void> {
  const cle = process.env.RESEND_API_KEY;
  if (!cle) {
    console.log(JSON.stringify({ t: new Date().toISOString(), niveau: "info", message: "email non envoyé (RESEND_API_KEY absente)", a: e.a, objet: e.sujet }));
    return;
  }
  const rep = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${cle}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "AlerteRobot <alertes@example.invalid>",
      to: [e.a],
      subject: e.sujet,
      html: e.html,
      text: e.texte,
      // Désabonnement en un clic dans le logiciel de messagerie (RFC 8058).
      ...(e.desabonnement ? { headers: { "List-Unsubscribe": `<${e.desabonnement}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!rep.ok) throw new Error(`Resend ${rep.status}`);
}

export function echapper(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Gabarit commun des emails aux abonnés d'une page de statut (thème clair, comme la page). */
export function emailStatut(o: { titre: string; corps: string; bouton?: { lien: string; texte: string }; pied: string }): string {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f6fa;font-family:Arial,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#ffffff;border:1px solid #e1e6ee;border-radius:12px;padding:28px">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${echapper(o.titre)}</h1>
<p style="margin:0 0 20px;line-height:1.6">${echapper(o.corps)}</p>
${o.bouton ? `<a href="${echapper(o.bouton.lien)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#0e7a50;color:#ffffff;font-weight:600;text-decoration:none">${echapper(o.bouton.texte)}</a>` : ""}
</div>
<p style="margin:16px 8px 0;font-size:12px;color:#4a5468;line-height:1.6">${o.pied}</p>
</div></body></html>`;
}
