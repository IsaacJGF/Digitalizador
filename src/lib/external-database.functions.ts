import { createServerFn } from "@tanstack/react-start";

// Only intentionally public connection fields cross the RPC boundary.
export const getExternalDatabaseConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { getExternalPublicConfig } = await import("./external-database.server");
  try {
    return { ok: true as const, config: getExternalPublicConfig() };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Banco externo não configurado em Lovable Secrets." };
  }
});