import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
type CookieList = { name: string; value: string; options: CookieOptions }[];

const ESPACE_CONNECTE = ["/tableau-de-bord", "/moniteurs", "/incidents", "/alertes", "/organisation", "/maintenances", "/pages-statut", "/rapports", "/integrations", "/reglages"];

function politique(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // En développement seulement, la fenêtre d'erreurs de Next pose des styles en ligne.
    // (Un nonce désactiverait 'unsafe-inline' : on n'en met pas dans ce cas.)
    dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    // Le navigateur ne parle qu'à notre serveur : Supabase est appelé côté serveur uniquement.
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * Chaque page reçoit une CSP à nonce unique et une session Supabase rafraîchie.
 * L'espace connecté redirige vers /connexion sans session ; chaque page et
 * chaque action revérifie l'utilisateur côté serveur (le proxy n'est qu'un premier filtre).
 */
export async function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = politique(nonce);
  const entetes = new Headers(req.headers);
  entetes.set("x-nonce", nonce);
  entetes.set("Content-Security-Policy", csp);

  let res = NextResponse.next({ request: { headers: entetes } });
  // Sans configuration Supabase ou si Supabase ne répond pas, le visiteur est traité comme
  // non connecté : le site public reste affiché au lieu d'une erreur 500 sur toutes les pages.
  let connecte = false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && cle) {
    try {
      const supabase = createServerClient(url, cle, {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (list: CookieList) => {
            list.forEach(({ name, value }) => req.cookies.set(name, value));
            res = NextResponse.next({ request: { headers: entetes } });
            list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
          },
        },
      });
      const { data: { user } } = await supabase.auth.getUser();
      connecte = Boolean(user);
    } catch {
      connecte = false;
    }
  }

  if (!connecte && ESPACE_CONNECTE.some((p) => req.nextUrl.pathname.startsWith(p))) {
    const cible = req.nextUrl.clone();
    cible.pathname = "/connexion";
    cible.search = "";
    return NextResponse.redirect(cible);
  }
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|sw.js|icon.svg|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
