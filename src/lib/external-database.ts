import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { validateExternalDatabaseConfig } from "./external-database-config";

let client: SupabaseClient<Database> | undefined;

export function configureExternalPublicClient(config: { url: string; publicKey: string }) {
  const validated = validateExternalDatabaseConfig(config.url, config.publicKey);
  client = createClient<Database>(validated.url, validated.publicKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, property) {
    if (!client) throw new Error("Banco externo indisponível. Configure os três EXTERNAL_SUPABASE_* em Lovable Secrets. Não há fallback para Lovable Cloud.");
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});