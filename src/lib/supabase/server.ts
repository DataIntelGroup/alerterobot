import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { DB_SCHEMA } from "./schema";
type CookieList = { name: string; value: string; options: CookieOptions }[];

/** Client lié à la session de l'utilisateur : toutes ses requêtes passent par la RLS. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    db: { schema: DB_SCHEMA },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: CookieList) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* appelé depuis un Server Component */ }
      },
    },
  });
}
