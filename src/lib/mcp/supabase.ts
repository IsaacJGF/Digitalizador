import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function env(name: string) { return process.env[name]?.trim(); }

export function supabaseAnon() {
  const url = env("SUPABASE_URL") ?? import.meta.env.VITE_SUPABASE_URL;
  let key = env("SUPABASE_PUBLISHABLE_KEY") ?? env("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!key) {
    try {
      const keys: unknown = JSON.parse(env("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
      if (keys && typeof keys === "object" && !Array.isArray(keys)) {
        key = Object.values(keys).find((v): v is string => typeof v === "string" && v.startsWith("sb_publishable_"));
      }
    } catch { /* Legacy key may still be available. */ }
  }
  key ??= env("SUPABASE_ANON_KEY") ?? env("VITE_SUPABASE_ANON_KEY") ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Configuração pública do banco indisponível.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (headers.get("Authorization")?.startsWith("Bearer sb_")) headers.delete("Authorization");
      return fetch(input, { ...init, headers });
    } },
  });
}