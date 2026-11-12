import { createServerOnlyFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getExternalPublicConfig } from "./external-database.server";

export const createExternalAdminClient = createServerOnlyFn(() => {
  const config = getExternalPublicConfig();
  const key =
    process.env["DIGITALIZADOR_SUPABASE_SECRET_KEY"] ??
    process.env["EXTERNAL_SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) throw new Error("DIGITALIZADOR_SUPABASE_SECRET_KEY não configurado em Lovable Secrets.");
  return createClient<Database>(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});
