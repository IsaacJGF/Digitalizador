import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseAnon } from "../supabase";
import { result, failure } from "../schemas";
export default defineTool({
  name: "obter_questao", title: "Abrir questão", description: "Lê os textos, alternativas e metadados públicos de uma questão; exclui dados internos de revisão e imagens em base64.",
  inputSchema: { id: z.uuid() }, annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ id }) => {
    const { data, error } = await (await supabaseAnon()).from("questions").select("id,numero,enunciado,tipo,alternativas,resposta,referencia_texto,referencia_fonte,area_geral,conteudo_principal,subconteudo_principal,conteudos_relacionados,tags_livres,ano,prova,instituicao,dificuldade,observacoes,updated_at").eq("id", id).single();
    return error ? failure(error.message) : result(data);
  },
});