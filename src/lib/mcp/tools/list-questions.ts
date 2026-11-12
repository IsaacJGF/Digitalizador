import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseAnon } from "../supabase";
import { result, failure } from "../schemas";

export default defineTool({
  name: "listar_questoes", title: "Consultar questões",
  description: "Busca questões públicas por texto e classificação, com paginação; não inclui dados internos de revisão nem imagens grandes.",
  inputSchema: { busca: z.string().max(200).optional(), area: z.string().max(200).optional(), conteudo: z.string().max(200).optional(), limite: z.number().int().min(1).max(50).default(20), offset: z.number().int().min(0).max(100000).default(0) },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ busca, area, conteudo, limite, offset }) => {
    let query = (await supabaseAnon()).from("questions").select("id,numero,enunciado,tipo,area_geral,conteudo_principal,ano,prova,instituicao,updated_at", { count: "exact" });
    if (busca) query = query.ilike("enunciado", `%${busca.replace(/[\\%_]/g, "\\$&")}%`);
    if (area) query = query.eq("area_geral", area);
    if (conteudo) query = query.eq("conteudo_principal", conteudo);
    const { data, count, error } = await query.order("created_at", { ascending: false }).order("id").range(offset, offset + limite - 1);
    return error ? failure(error.message) : result({ total: count, questoes: data, proximo_offset: offset + (data?.length ?? 0) });
  },
});