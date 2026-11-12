import { createServerOnlyFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { validateExternalDatabaseConfig } from "./external-database-config";

export const getExternalPublicConfig = createServerOnlyFn(() => {
  return validateExternalDatabaseConfig(
    process.env["EXTERNAL_SUPABASE_URL"],
    process.env["EXTERNAL_SUPABASE_PUBLISHABLE_KEY"],
    process.env["EXTERNAL_SUPABASE_SERVICE_ROLE_KEY"],
    true,
  );
});

export const createExternalPublicClient = createServerOnlyFn(() => {
  const config = getExternalPublicConfig();
  return createClient<Database>(config.url, config.publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (headers.get("Authorization") === `Bearer ${config.publicKey}` && config.publicKey.startsWith("sb_")) headers.delete("Authorization");
      headers.set("apikey", config.publicKey);
      return fetch(input, { ...init, headers });
    } },
  });
});
