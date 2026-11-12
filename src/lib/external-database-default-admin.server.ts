import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createExternalAdminClient } from "./external-database-admin.server";

// Compatibility for the generated default server client, without editing it.
export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
  get(_target, property) {
    const client = createExternalAdminClient();
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});