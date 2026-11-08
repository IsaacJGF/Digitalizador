import { defineTool } from "@lovable.dev/mcp-js";
import { catalogCreateSchema, catalogTables, result, failure } from "../schemas";
import { supabaseAnon } from "../supabase";
export default defineTool({
  name: "criar_item_catalogo", title: "Cadastrar item de catálogo", description: "Cria um item público; conteúdos exigem parent_id da área e subconteúdos do conteúdo. Peça confirmação antes de executar.",
  inputSchema: { item: catalogCreateSchema }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ item }) => {
    const client = supabaseAnon();
    const response = item.tipo === "conteudo"
      ? await client.from("catalog_conteudos").insert({ nome: item.nome, area_id: item.parent_id ?? "" }).select().single()
      : item.tipo === "subconteudo"
        ? await client.from("catalog_subconteudos").insert({ nome: item.nome, conteudo_id: item.parent_id ?? "" }).select().single()
        : await client.from(catalogTables[item.tipo]).insert({ nome: item.nome }).select().single();
    return response.error ? failure(response.error.message) : result(response.data);
  },
});