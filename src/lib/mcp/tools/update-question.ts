import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { updateQuestionSchema, result, failure } from "../schemas";
import { supabaseAnon } from "../supabase";
export default defineTool({
  name: "atualizar_questao", title: "Editar questão", description: "Atualiza somente os campos informados de uma questão pública. Leia a questão antes e peça confirmação; pode reiniciar seus critérios automáticos de revisão.",
  inputSchema: { id: z.uuid(), updated_at: z.string().datetime({ offset: true }).describe("Versão obtida ao ler a questão; impede sobrescrever edições concorrentes."), alteracoes: updateQuestionSchema },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ id, updated_at, alteracoes }) => {
    const { data, error } = await (await supabaseAnon()).from("questions").update(alteracoes).eq("id", id).eq("updated_at", updated_at).select("id,numero,updated_at").maybeSingle();
    if (error) return failure(error.message);
    return data ? result(data) : failure("Questão inexistente ou alterada por outra pessoa. Leia novamente antes de editar.");
  },
});