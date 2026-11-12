export async function supabaseAnon() {
  const { createExternalPublicClient } = await import("../external-database.server");
  return createExternalPublicClient();
}