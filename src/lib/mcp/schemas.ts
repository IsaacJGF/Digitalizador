import { z } from "zod";

export const questionFields = {
  enunciado: z.string().min(1).max(50000),
  numero: z.string().max(100).nullable().optional(),
  tipo: z.enum(["multipla_escolha", "discursiva"]).optional(),
  alternativas: z.array(z.object({ letra: z.string().max(10), texto: z.string().max(20000) }).strict()).max(26).optional(),
  resposta: z.string().max(20000).nullable().optional(),
  referencia_texto: z.string().max(50000).nullable().optional(),
  referencia_fonte: z.string().max(2000).nullable().optional(),
  area_geral: z.string().max(200).nullable().optional(),
  conteudo_principal: z.string().max(200).nullable().optional(),
  subconteudo_principal: z.string().max(200).nullable().optional(),
  conteudos_relacionados: z.array(z.string().max(200)).max(100).optional(),
  tags_livres: z.array(z.string().max(200)).max(100).optional(),
  ano: z.string().max(100).nullable().optional(),
  prova: z.string().max(200).nullable().optional(),
  instituicao: z.string().max(200).nullable().optional(),
  dificuldade: z.string().max(100).nullable().optional(),
  observacoes: z.string().max(20000).nullable().optional(),
};
export const createQuestionSchema = z.object(questionFields).strict();
export const updateQuestionSchema = createQuestionSchema.partial().refine(v => Object.keys(v).length > 0, "Informe ao menos um campo.");
export const catalogKind = z.enum(["area", "conteudo", "subconteudo", "relacionado", "tag", "prova", "instituicao"]);
export const catalogTables = {
  area: "catalog_areas", conteudo: "catalog_conteudos", subconteudo: "catalog_subconteudos",
  relacionado: "catalog_relacionados", tag: "catalog_tags", prova: "catalog_provas", instituicao: "catalog_instituicoes",
} as const;
export const catalogCreateSchema = z.object({
  tipo: catalogKind, nome: z.string().trim().min(1).max(200), parent_id: z.uuid().optional(),
}).strict().refine(v => !["conteudo", "subconteudo"].includes(v.tipo) || Boolean(v.parent_id), "Este catálogo exige o identificador do item pai.");

export function result(data: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(data) }] }; }
export function failure(message: string) { return { ...result({ erro: message }), isError: true }; }