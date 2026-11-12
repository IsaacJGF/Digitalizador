import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { catalogKind, catalogTables, result, failure } from "../schemas";
import { supabaseAnon } from "../supabase";
export default defineTool({
  name: "definir_catalogo_ativo", title: "Ativar ou desativar item", description: "Edita o estado ativo de um item público sem renomear, excluir ou alterar questões vinculadas. Peça confirmação antes de executar.",
  inputSchema: { tipo: catalogKind, id: z.uuid(), ativo: z.boolean() }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ tipo, id, ativo }) => {
    const { data, error } = await (await supabaseAnon()).from(catalogTables[tipo]).update({ ativo }).eq("id", id).select("id,nome,ativo").single();
    return error ? failure(error.message) : result(data);
  },
});