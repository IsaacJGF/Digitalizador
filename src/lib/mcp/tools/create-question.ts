import { defineTool } from "@lovable.dev/mcp-js";
import { createQuestionSchema, result, failure } from "../schemas";
import { supabaseAnon } from "../supabase";
export default defineTool({
  name: "criar_questao", title: "Cadastrar questão", description: "Cria uma questão pública manual a partir de textos e metadados. Peça confirmação do conteúdo antes de executar.",
  inputSchema: { questao: createQuestionSchema }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ questao }) => {
    const { data, error } = await supabaseAnon().from("questions").insert(questao).select("id,numero,updated_at").single();
    return error ? failure(error.message) : result(data);
  },
});