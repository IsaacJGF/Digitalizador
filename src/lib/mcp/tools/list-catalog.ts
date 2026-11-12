import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { catalogKind, catalogTables, result, failure } from "../schemas";
import { supabaseAnon } from "../supabase";
export default defineTool({
  name: "listar_catalogo", title: "Consultar catálogo", description: "Lista um dos sete catálogos públicos, incluindo IDs, nome, estado ativo e vínculo pai quando aplicável.",
  inputSchema: { tipo: catalogKind, limite: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).max(100000).default(0) },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ tipo, limite, offset }) => {
    const { data, error, count } = await (await supabaseAnon()).from(catalogTables[tipo]).select("*", { count: "exact" }).order("nome").order("id").range(offset, offset + limite - 1);
    return error ? failure(error.message) : result({ total: count, itens: data });
  },
});