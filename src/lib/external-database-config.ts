export const EXTERNAL_DATABASE_HOST = "umofughlvohswsfdridk.supabase.co";

export function validateExternalDatabaseConfig(url: string | undefined, publicKey: string | undefined, adminKey?: string, requireAdmin = false) {
  const missing = [
    ...(!url?.trim() ? ["EXTERNAL_SUPABASE_URL"] : []),
    ...(!publicKey?.trim() ? ["EXTERNAL_SUPABASE_PUBLISHABLE_KEY"] : []),
    ...(requireAdmin && !adminKey?.trim() ? ["DIGITALIZADOR_SUPABASE_SECRET_KEY"] : []),
  ];
  if (missing.length) throw new Error(`Banco externo não configurado. Cadastre em Lovable Secrets: ${missing.join(", ")}. Nenhuma consulta será enviada ao Lovable Cloud.`);
  const parsed = new URL(url?.trim() ?? "");
  if (parsed.protocol !== "https:" || parsed.host !== EXTERNAL_DATABASE_HOST || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("EXTERNAL_SUPABASE_URL deve apontar ao projeto externo autorizado. Nenhuma consulta será enviada ao Lovable Cloud.");
  }
  return { url: parsed.origin, publicKey: publicKey?.trim() ?? "" };
}