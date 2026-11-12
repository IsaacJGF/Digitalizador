// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Generated integration files are managed by Lovable. Redirect their public
// and admin entry points rather than editing them or consuming managed env.
const externalDatabaseClients = {
  name: "external-only-database-clients",
  enforce: "pre" as const,
  resolveId(source: string, importer?: string) {
    const normalized = source.replace(/\\/g, "/").replace(/\.ts$/, "");
    const integrationImport = importer?.replace(/\\/g, "/").includes("/src/integrations/supabase/");
    if (normalized.endsWith("/integrations/supabase/client.server") || (integrationImport && normalized === "./client.server")) {
      return new URL("./src/lib/external-database-default-admin.server.ts", import.meta.url).pathname;
    }
    if (normalized.endsWith("/integrations/supabase/client") || (integrationImport && normalized === "./client")) {
      return new URL("./src/lib/external-database.ts", import.meta.url).pathname;
    }
    return null;
  },
};

export default defineConfig({
  vite: { plugins: [externalDatabaseClients, mcpPlugin()] },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
