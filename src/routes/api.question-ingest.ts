import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const REPOSITORY = "IsaacJGF/Digitalizador";
const AUTHORIZED_AUTHOR = "IsaacJGFerreira";
const MAX_BODY_BYTES = 2_000_000;
const QUESTION_TYPES = ["certo_errado", "numerica", "multipla_escolha", "discursiva"] as const;

const optionalText = (maxLength: number) =>
  z.string().trim().max(maxLength).nullable().optional();

const alternativeSchema = z
  .object({
    letra: z.string().trim().regex(/^[A-Z]$/),
    texto: z.string().trim().max(10_000).default(""),
    imagem_pendente: z.boolean().optional(),
  })
  .strict()
  .superRefine((alternative, context) => {
    if (!alternative.texto && !alternative.imagem_pendente) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["texto"],
        message: "A alternativa precisa ter texto ou um espaço reservado para imagem.",
      });
    }
  });

const contentBlockSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("texto"), texto: z.string().max(40_000) }).strict(),
  z.object({ tipo: z.literal("imagem") }).strict(),
]);

const questionBaseSchema = z
  .object({
    numero: optionalText(40),
    enunciado: z.string().trim().max(30_000).optional(),
    enunciado_blocos: z.array(contentBlockSchema).max(41).optional(),
    alternativas: z.array(alternativeSchema).max(10).default([]),
    tipo: z.enum(QUESTION_TYPES).default("multipla_escolha"),
    resposta: z.string().trim().max(10_000).nullable().optional(),
    fonte: optionalText(1_000),
    area_geral: optionalText(200),
    conteudo_principal: optionalText(200),
    subconteudo_principal: optionalText(200),
    conteudos_relacionados: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
    tags_livres: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
    dificuldade: optionalText(50),
    ano: optionalText(20),
    prova: optionalText(100),
    instituicao: optionalText(200),
    modalidade: optionalText(100),
    caderno: optionalText(100),
    observacoes: optionalText(3_000),
    referencia_texto: optionalText(40_000),
    referencia_blocos: z.array(contentBlockSchema).max(41).optional(),
    referencia_fonte: optionalText(1_000),
    tem_equacao: z.boolean().optional(),
  })
  .strict();

type QuestionFields = z.infer<typeof questionBaseSchema>;
type ContentBlock = z.infer<typeof contentBlockSchema>;
type ReferenceInput = {
  id?: string;
  texto?: string | null;
  blocos?: ContentBlock[];
  fonte?: string | null;
};

function addContentBlockIssues(
  blocks: ContentBlock[] | undefined,
  path: string,
  maxTextLength: number,
  context: z.RefinementCtx,
) {
  if (!blocks) return;
  const imageCount = blocks.filter((block) => block.tipo === "imagem").length;
  const totalTextLength = blocks.reduce(
    (total, block) => total + (block.tipo === "texto" ? block.texto.length : 0),
    0,
  );
  if (imageCount > 20) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: "Cada trecho pode conter no máximo 20 espaços reservados para imagem.",
    });
  }
  if (totalTextLength > maxTextLength) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: "O texto excede o limite de " + maxTextLength + " caracteres.",
    });
  }
  if (blocks.some((block) => block.tipo === "texto" && /\[\[img:\d+\]\]/.test(block.texto))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: "Use um bloco tipo imagem no ponto correto; não digite marcadores de imagem no texto.",
    });
  }
}

function validateQuestionFields(
  question: QuestionFields & { referencia_id?: string | null },
  context: z.RefinementCtx,
  batch: boolean,
) {
  const statementText = question.enunciado?.trim() ?? "";
  const statementBlocks = question.enunciado_blocos;
  const hasStatementBlocks = Boolean(statementBlocks?.length);
  if (!statementText && !hasStatementBlocks) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["enunciado"],
      message: "Informe o enunciado como texto ou blocos de texto/imagem.",
    });
  }
  if (statementText && statementBlocks) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["enunciado_blocos"],
      message: "Envie enunciado ou enunciado_blocos, não os dois.",
    });
  }
  addContentBlockIssues(statementBlocks, "enunciado_blocos", 30_000, context);

  if (question.referencia_texto?.trim() && question.referencia_blocos) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["referencia_blocos"],
      message: "Envie referencia_texto ou referencia_blocos, não os dois.",
    });
  }
  addContentBlockIssues(question.referencia_blocos, "referencia_blocos", 40_000, context);
  if (/\[\[img:\d+\]\]/.test(question.referencia_texto ?? "")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["referencia_texto"],
      message: "Use referencia_blocos com um bloco tipo imagem no lugar de marcadores.",
    });
  }
  if (/\[\[img:\d+\]\]/.test(question.enunciado ?? "")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["enunciado"],
      message: "Use enunciado_blocos com um bloco tipo imagem no lugar de marcadores.",
    });
  }

  const letters = question.alternativas.map((alternative) => alternative.letra);
  if (new Set(letters).size !== letters.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["alternativas"],
      message: "As letras das alternativas precisam ser únicas.",
    });
  }

  if (question.tipo === "multipla_escolha") {
    if (question.alternativas.length < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["alternativas"],
        message: "Uma questão de múltipla escolha precisa de ao menos duas alternativas.",
      });
    }
    if (question.resposta && !letters.includes(question.resposta)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resposta"],
        message: "A resposta precisa corresponder a uma alternativa.",
      });
    }
  } else if (question.alternativas.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["alternativas"],
      message: "Itens que não são de múltipla escolha devem ter alternativas vazias.",
    });
  }

  const answer = question.resposta?.trim() ?? "";
  if (question.tipo === "certo_errado" && answer && !/^(C|E)$/i.test(answer)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resposta"],
      message: "A resposta de um item certo/errado deve ser C ou E.",
    });
  }
  if (question.tipo === "numerica" && answer && !Number.isFinite(Number(answer.replace(",", ".")))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resposta"],
      message: "A resposta de um item numérico deve ser um número.",
    });
  }

  if (batch) {
    for (const field of ["numero", "ano", "prova", "instituicao", "area_geral", "conteudo_principal", "subconteudo_principal"] as const) {
      if (!question[field]?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "Este campo é obrigatório para importar um lote.",
        });
      }
    }
    if (question.tipo !== "discursiva" && !answer) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resposta"],
        message: "Informe o gabarito oficial verificado.",
      });
    }
  }
}

const questionSchema = questionBaseSchema.superRefine((question, context) => {
  validateQuestionFields(question, context, false);
});

const batchQuestionSchema = questionBaseSchema
  .extend({ referencia_id: optionalText(80) })
  .superRefine((question, context) => {
    validateQuestionFields(question, context, true);
  });

const batchReferenceSchema = z
  .object({
    id: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/),
    texto: z.string().max(40_000).optional(),
    blocos: z.array(contentBlockSchema).max(41).optional(),
    fonte: optionalText(1_000),
  })
  .strict()
  .superRefine((reference, context) => {
    const hasText = Boolean(reference.texto?.trim());
    const hasBlocks = Boolean(reference.blocos?.length);
    if (!hasText && !hasBlocks) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["texto"],
        message: "Uma referência precisa conter texto ou blocos.",
      });
    }
    if (hasText && reference.blocos) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blocos"],
        message: "Envie texto ou blocos na referência, não os dois.",
      });
    }
    addContentBlockIssues(reference.blocos, "blocos", 40_000, context);
    if (/\[\[img:\d+\]\]/.test(reference.texto ?? "")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["texto"],
        message: "Use um bloco tipo imagem no lugar de marcadores.",
      });
    }
  });

const batchSchema = z
  .object({
    schema_version: z.literal(1),
    batch_key: z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9._-]+$/),
    references: z.array(batchReferenceSchema).max(35).default([]),
    questions: z.array(batchQuestionSchema).min(1).max(35),
  })
  .strict()
  .superRefine((batch, context) => {
    const referenceIds = new Set<string>();
    batch.references.forEach((reference, index) => {
      if (referenceIds.has(reference.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["references", index, "id"],
          message: "O identificador da referência está repetido.",
        });
      }
      referenceIds.add(reference.id);
    });

    const questionKeys = new Set<string>();
    batch.questions.forEach((question, index) => {
      const identity = [
        question.instituicao,
        question.prova,
        question.ano,
        question.modalidade,
        question.caderno,
        question.numero,
      ].map((value) => normalizeIdentityPart(value ?? "")).join("|");
      if (questionKeys.has(identity)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index],
          message: "O lote repete a identidade de prova, ano, modalidade, caderno e número.",
        });
      }
      questionKeys.add(identity);

      if (question.referencia_id && !referenceIds.has(question.referencia_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "referencia_id"],
          message: "A referência indicada não existe no manifesto.",
        });
      }
      if (
        question.referencia_id &&
        (question.referencia_texto?.trim() || question.referencia_blocos || question.referencia_fonte?.trim())
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "referencia_id"],
          message: "Use a referência compartilhada ou os campos de referência do item, não os dois.",
        });
      }
    });
  });

const issueRequestSchema = z
  .object({
    question: questionSchema,
    source: z
      .object({
        repository: z.literal(REPOSITORY),
        issue_number: z.number().int().positive(),
        issue_id: z.number().int().positive(),
        issue_url: z.string().url().max(2_048),
        author: z.literal(AUTHORIZED_AUTHOR),
      })
      .strict(),
  })
  .strict();

const batchRequestSchema = z
  .object({
    batch: batchSchema,
    source: z
      .object({
        repository: z.literal(REPOSITORY),
        pull_request_number: z.number().int().positive(),
        pull_request_id: z.number().int().positive(),
        pull_request_url: z.string().url().max(2_048),
        pull_request_author: z.literal(AUTHORIZED_AUTHOR),
        head_sha: z.string().regex(/^[a-f0-9]{40}$/i),
      })
      .strict(),
  })
  .strict();

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function validationDetails(error: z.ZodError) {
  return error.issues.slice(0, 12).map((issue) => issue.path.join(".") + ": " + issue.message);
}

function normalizeIdentityPart(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
}

async function sha256Hex(source: string) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function stableUuid(source: string): Promise<string> {
  const bytes = Array.from(
    new Uint8Array(
      await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)),
    ).slice(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

async function stableQuestionId(issueId: number): Promise<string> {
  return stableUuid(REPOSITORY + "#issue-id:" + String(issueId));
}

function toStoredContent(
  text: string | null | undefined,
  blocks: ContentBlock[] | undefined,
) {
  if (!blocks) return { text: text?.trim() || null, images: [] as { url: string; pending: true }[] };
  const images: { url: string; pending: true }[] = [];
  const output = blocks.map((block) => {
    if (block.tipo === "texto") return block.texto;
    const imageNumber = images.push({ url: "", pending: true });
    return "[[img:" + imageNumber + "]]";
  }).join("");
  return { text: output || null, images };
}

function toQuestionRow(
  question: QuestionFields,
  id: string,
  metadata?: {
    groupId?: string | null;
    importKey?: string;
    reference?: ReferenceInput;
  },
) {
  const related = question.conteudos_relacionados ?? [];
  const tags = question.tags_livres ?? [];
  const reference = metadata?.reference
    ? toStoredContent(metadata.reference.texto, metadata.reference.blocos)
    : toStoredContent(question.referencia_texto, question.referencia_blocos);
  const statement = toStoredContent(question.enunciado, question.enunciado_blocos);
  const alternatives = question.alternativas.map((alternative) => ({
    letra: alternative.letra,
    texto: alternative.texto,
    ...(alternative.imagem_pendente ? { imagem_pendente: true } : {}),
  }));

  return {
    id,
    numero: question.numero || null,
    enunciado: statement.text || "",
    alternativas: alternatives,
    tipo: question.tipo,
    resposta: question.resposta
      ? question.tipo === "certo_errado" ? question.resposta.toUpperCase() : question.resposta
      : null,
    fonte: question.fonte || null,
    disciplina: question.area_geral || null,
    conteudo: question.conteudo_principal || null,
    dificuldade: question.dificuldade || null,
    area_geral: question.area_geral || null,
    conteudo_principal: question.conteudo_principal || null,
    subconteudo_principal: question.subconteudo_principal || null,
    conteudos_relacionados: related,
    tags_livres: tags,
    tags: tags.length > 0 ? tags : null,
    ano: question.ano || null,
    prova: question.prova || null,
    instituicao: question.instituicao || null,
    observacoes: question.observacoes || null,
    referencia_texto: reference.text,
    referencia_fonte: metadata?.reference?.fonte || question.referencia_fonte || null,
    referencia_imagem: null,
    referencia_imagem_pos: null,
    referencia_imagem_layout: null,
    referencia_texto_apos: null,
    referencia_imagens_extra: reference.images,
    grupo_id: metadata?.groupId ?? null,
    tem_equacao: question.tem_equacao ?? false,
    tem_imagem: reference.images.length > 0 ||
      statement.images.length > 0 ||
      alternatives.some((alternative) => alternative.imagem_pendente === true),
    imagem_original_url: null,
    enunciado_imagem: null,
    enunciado_imagem_pos: null,
    enunciado_imagem_layout: null,
    enunciado_imagens_extra: statement.images,
    ...(metadata?.importKey
      ? {
          modalidade: question.modalidade || null,
          caderno: question.caderno || null,
          import_key: metadata.importKey,
        }
      : {}),
  };
}

type CatalogRow = { id: string; nome: string; ativo?: boolean; area_id?: string; conteudo_id?: string };

function findCatalogItem<T extends { nome: string }>(name: string | null | undefined, items: T[]) {
  const normalized = normalizeIdentityPart(name ?? "");
  return items.find((item) => normalizeIdentityPart(item.nome) === normalized);
}

async function validateActiveCatalogs(db: any, questions: z.infer<typeof batchSchema>["questions"]) {
  const requests = await Promise.all([
    db.from("catalog_areas").select("id,nome,ativo").eq("ativo", true),
    db.from("catalog_conteudos").select("id,nome,ativo,area_id").eq("ativo", true),
    db.from("catalog_subconteudos").select("id,nome,ativo,conteudo_id").eq("ativo", true),
    db.from("catalog_relacionados").select("id,nome,ativo").eq("ativo", true),
    db.from("catalog_tags").select("id,nome,ativo").eq("ativo", true),
    db.from("catalog_provas").select("id,nome,ativo").eq("ativo", true),
    db.from("catalog_instituicoes").select("id,nome,ativo").eq("ativo", true),
  ]);
  const failed = requests.find((result) => result.error);
  if (failed) {
    return {
      questions: null,
      details: [{ path: "catalogs", message: "Não foi possível ler os catálogos ativos do banco." }],
      errorCode: failed.error.code,
    };
  }

  const [areas, contents, subcontents, relatedCatalog, tagCatalog, exams, institutions] =
    requests.map((result) => (result.data ?? []) as CatalogRow[]);
  const details: Array<{ path: string; message: string }> = [];
  const normalized = questions.map((question, index) => {
    const prefix = "questions[" + index + "].";
    const area = findCatalogItem(question.area_geral, areas);
    const content = area
      ? contents.find((item) =>
          item.area_id === area.id &&
          normalizeIdentityPart(item.nome) === normalizeIdentityPart(question.conteudo_principal ?? ""),
        )
      : undefined;
    const subcontent = content
      ? subcontents.find((item) =>
          item.conteudo_id === content.id &&
          normalizeIdentityPart(item.nome) === normalizeIdentityPart(question.subconteudo_principal ?? ""),
        )
      : undefined;
    const exam = findCatalogItem(question.prova, exams);
    const institution = findCatalogItem(question.instituicao, institutions);

    if (!area) details.push({ path: prefix + "area_geral", message: "Área geral inexistente ou inativa no catálogo." });
    if (!content) details.push({ path: prefix + "conteudo_principal", message: "Conteúdo principal inexistente, inativo ou vinculado a outra área." });
    if (!subcontent) details.push({ path: prefix + "subconteudo_principal", message: "Subconteúdo inexistente, inativo ou vinculado a outro conteúdo." });
    if (!exam) details.push({ path: prefix + "prova", message: "Prova inexistente ou inativa no catálogo." });
    if (!institution) details.push({ path: prefix + "instituicao", message: "Instituição inexistente ou inativa no catálogo." });

    const related = (question.conteudos_relacionados ?? []).map((name) => {
      const match = findCatalogItem(name, relatedCatalog);
      if (!match) details.push({ path: prefix + "conteudos_relacionados", message: "Conteúdo relacionado ausente ou inativo: " + name });
      return match?.nome ?? name;
    });
    const tags = (question.tags_livres ?? []).map((name) => {
      const match = findCatalogItem(name, tagCatalog);
      if (!match) details.push({ path: prefix + "tags_livres", message: "Tag ausente ou inativa: " + name });
      return match?.nome ?? name;
    });

    return {
      ...question,
      area_geral: area?.nome ?? question.area_geral,
      conteudo_principal: content?.nome ?? question.conteudo_principal,
      subconteudo_principal: subcontent?.nome ?? question.subconteudo_principal,
      conteudos_relacionados: related,
      tags_livres: tags,
      prova: exam?.nome ?? question.prova,
      instituicao: institution?.nome ?? question.instituicao,
    };
  });

  return { questions: details.length ? null : normalized, details, errorCode: null };
}

function baseIdentityMatches(existing: Record<string, unknown>, question: QuestionFields) {
  return normalizeIdentityPart(String(existing.numero ?? "")) === normalizeIdentityPart(question.numero ?? "") &&
    normalizeIdentityPart(String(existing.ano ?? "")) === normalizeIdentityPart(question.ano ?? "") &&
    normalizeIdentityPart(String(existing.prova ?? "")) === normalizeIdentityPart(question.prova ?? "") &&
    normalizeIdentityPart(String(existing.instituicao ?? "")) === normalizeIdentityPart(question.instituicao ?? "");
}

function isPotentialDuplicate(existing: Record<string, unknown>, question: QuestionFields) {
  if (!baseIdentityMatches(existing, question)) return false;
  const existingModality = typeof existing.modalidade === "string" ? normalizeIdentityPart(existing.modalidade) : "";
  const existingNotebook = typeof existing.caderno === "string" ? normalizeIdentityPart(existing.caderno) : "";
  const incomingModality = normalizeIdentityPart(question.modalidade ?? "");
  const incomingNotebook = normalizeIdentityPart(question.caderno ?? "");
  if (!existingModality || !existingNotebook || !incomingModality || !incomingNotebook) return true;
  return existingModality === incomingModality && existingNotebook === incomingNotebook;
}

const IMPORT_CONTENT_COLUMNS = [
  "numero",
  "enunciado",
  "alternativas",
  "tipo",
  "resposta",
  "fonte",
  "disciplina",
  "conteudo",
  "dificuldade",
  "area_geral",
  "conteudo_principal",
  "subconteudo_principal",
  "conteudos_relacionados",
  "tags_livres",
  "tags",
  "ano",
  "prova",
  "instituicao",
  "observacoes",
  "referencia_texto",
  "referencia_fonte",
  "referencia_imagem",
  "referencia_imagem_pos",
  "referencia_imagem_layout",
  "referencia_texto_apos",
  "referencia_imagens_extra",
  "grupo_id",
  "tem_equacao",
  "tem_imagem",
  "imagem_original_url",
  "enunciado_imagem",
  "enunciado_imagem_pos",
  "enunciado_imagem_layout",
  "enunciado_imagens_extra",
  "modalidade",
  "caderno",
  "import_key",
] as const;

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).sort().map((key) =>
      JSON.stringify(key) + ":" + stableJson(record[key]),
    ).join(",") + "}";
  }
  return JSON.stringify(value) ?? String(value);
}

function importedContentMatches(
  existing: Record<string, unknown>,
  expected: Record<string, unknown>,
) {
  return IMPORT_CONTENT_COLUMNS.every((column) =>
    stableJson(existing[column]) === stableJson(expected[column]),
  );
}

function duplicateManifestResult(prepared: Array<{
  id: string;
  question: QuestionFields;
  importKey: string;
  row: Record<string, unknown>;
}>, existing: Map<string, Record<string, unknown>>) {
  const mismatches = prepared.filter((item) => {
    const row = existing.get(item.importKey);
    return row && !importedContentMatches(row, item.row);
  });
  if (mismatches.length) {
    return json({
      ok: false,
      error: "A identidade já foi importada com conteúdo diferente. Nenhuma questão foi alterada; revise o manifesto.",
      details: mismatches.map((item) => "Item " + (item.question.numero ?? "?") + " tem conteúdo diferente do lote já cadastrado."),
    }, 409);
  }
  const ids = new Map<string, string>(
    [...existing.entries()].flatMap(([key, row]) =>
      typeof row.id === "string" ? [[key, row.id] as [string, string]] : [],
    ),
  );
  return json({
    ok: true,
    status: "already_inserted",
    count: prepared.length,
    questions: importedResults(prepared, ids, "already_inserted"),
  });
}

function importedResults(
  questions: Array<{ id: string; question: QuestionFields; importKey: string }>,
  existing: Map<string, string>,
  status: "inserted" | "already_inserted",
) {
  return questions.map(({ id, question, importKey }) => ({
    numero: question.numero ?? null,
    id: existing.get(importKey) ?? id,
    status,
  }));
}

async function importIssueQuestion(input: z.infer<typeof issueRequestSchema>) {
  const { question, source } = input;
  const id = await stableQuestionId(source.issue_id);

  // Keep the service-role client inside the server handler.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("questions")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    console.error("[Question ingest] Duplicate lookup failed:", lookupError.code);
    return json({ ok: false, error: "Não foi possível consultar o banco de questões." }, 502);
  }
  if (existing) return json({ ok: true, status: "already_inserted", id });

  const { data, error } = await supabaseAdmin
    .from("questions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(toQuestionRow(question, id) as any)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return json({ ok: true, status: "already_inserted", id });
    console.error("[Question ingest] Insert failed:", error.code);
    return json({ ok: false, error: "Não foi possível gravar a questão no banco." }, 502);
  }
  return json({ ok: true, status: "inserted", id: data.id }, 201);
}

async function importQuestionBatch(input: z.infer<typeof batchRequestSchema>) {
  const { batch, source } = input;
  // Keep the service-role client inside this server handler.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const catalog = await validateActiveCatalogs(db, batch.questions);
  if (!catalog.questions) {
    if (catalog.errorCode) {
      console.error("[Question ingest] Active catalog lookup failed:", catalog.errorCode);
      return json({ ok: false, error: "Não foi possível validar os catálogos ativos." }, 502);
    }
    return json({
      ok: false,
      error: "O lote contém opções que não existem ou estão inativas. Nenhum item foi salvo.",
      details: catalog.details,
    }, 422);
  }

  const references = new Map(batch.references.map((reference) => [reference.id, reference]));
  const prepared = await Promise.all(catalog.questions.map(async (question) => {
    const identity = [
      source.repository,
      question.instituicao,
      question.prova,
      question.ano,
      question.modalidade,
      question.caderno,
      question.numero,
    ].map((value) => normalizeIdentityPart(String(value ?? ""))).join("\u001f");
    const importKey = await sha256Hex("digitalizador-question-import-v1\u001f" + identity);
    const id = await stableUuid("digitalizador-question-import-id-v1\u001f" + importKey);
    const sharedReference = question.referencia_id ? references.get(question.referencia_id) : undefined;
    const groupId = sharedReference
      ? await stableUuid("digitalizador-question-reference-v1\u001f" + batch.batch_key + "\u001f" + sharedReference.id)
      : null;
    return {
      id,
      importKey,
      question,
      row: toQuestionRow(question, id, {
        importKey,
        groupId,
        reference: sharedReference,
      }),
    };
  }));

  const keys = prepared.map((item) => item.importKey);
  const { data: importedRows, error: keyLookupError } = await db
    .from("questions")
    .select("*")
    .in("import_key", keys);
  if (keyLookupError) {
    if (keyLookupError.code === "42703") {
      return json({
        ok: false,
        error: "A migração de identidade de importação ainda precisa ser aplicada antes do primeiro lote.",
      }, 503);
    }
    console.error("[Question ingest] Import-key lookup failed:", keyLookupError.code);
    return json({ ok: false, error: "Não foi possível verificar reenvios do lote." }, 502);
  }

  const existingByKey = new Map<string, Record<string, unknown>>(
    (importedRows ?? []).flatMap((row: Record<string, unknown>) =>
      typeof row.id === "string" && typeof row.import_key === "string"
        ? [[row.import_key, row] as [string, Record<string, unknown>]]
        : [],
    ),
  );
  if (existingByKey.size === prepared.length) {
    return duplicateManifestResult(prepared, existingByKey);
  }
  if (existingByKey.size > 0) {
    return json({
      ok: false,
      error: "Parte deste lote já existe. Para evitar importação parcial, nenhum novo item foi gravado.",
      details: prepared
        .filter((item) => existingByKey.has(item.importKey))
        .map((item) => "Item " + (item.question.numero ?? "?") + " já está no banco."),
    }, 409);
  }

  const years = [...new Set(prepared.map((item) => item.question.ano as string))];
  const exams = [...new Set(prepared.map((item) => item.question.prova as string))];
  const institutions = [...new Set(prepared.map((item) => item.question.instituicao as string))];
  const numbers = [...new Set(prepared.map((item) => item.question.numero as string))];
  const { data: possibleDuplicates, error: duplicateLookupError } = await db
    .from("questions")
    .select("id,import_key,numero,ano,prova,instituicao,modalidade,caderno")
    .in("ano", years)
    .in("prova", exams)
    .in("instituicao", institutions)
    .in("numero", numbers);
  if (duplicateLookupError) {
    if (duplicateLookupError.code === "42703") {
      return json({
        ok: false,
        error: "A migração de identidade de importação ainda precisa ser aplicada antes do primeiro lote.",
      }, 503);
    }
    console.error("[Question ingest] Duplicate tuple lookup failed:", duplicateLookupError.code);
    return json({ ok: false, error: "Não foi possível verificar possíveis duplicatas." }, 502);
  }

  const conflicts = prepared.flatMap((item) => {
    const match = (possibleDuplicates ?? []).find((row: Record<string, unknown>) =>
      !row.import_key && isPotentialDuplicate(row, item.question),
    );
    return match
      ? ["Item " + (item.question.numero ?? "?") + " pode duplicar o registro " + String(match.id) + "."]
      : [];
  });
  if (conflicts.length > 0) {
    return json({
      ok: false,
      error: "Há possíveis duplicatas de questões cadastradas manualmente. Nenhum item foi salvo.",
      details: conflicts,
    }, 409);
  }

  const { data, error } = await db
    .from("questions")
    .insert(prepared.map((item) => item.row))
    .select("id,import_key");

  if (error) {
    if (error.code === "23505") {
      const { data: afterRace, error: afterRaceError } = await db
        .from("questions")
        .select("*")
        .in("import_key", keys);
      if (!afterRaceError && (afterRace ?? []).length === prepared.length) {
        const afterRaceMap = new Map<string, Record<string, unknown>>(
          (afterRace ?? []).flatMap((row: Record<string, unknown>) =>
            typeof row.id === "string" && typeof row.import_key === "string"
              ? [[row.import_key, row] as [string, Record<string, unknown>]]
              : [],
          ),
        );
        if (afterRaceMap.size === prepared.length) {
          return duplicateManifestResult(prepared, afterRaceMap);
        }
      }
      return json({
        ok: false,
        error: "O banco detectou uma identidade duplicada. Nenhum item deste lote foi gravado.",
      }, 409);
    }
    if (error.code === "42703") {
      return json({ ok: false, error: "A migração de identidade de importação ainda precisa ser aplicada." }, 503);
    }
    console.error("[Question ingest] Batch insert failed:", error.code);
    return json({ ok: false, error: "O banco recusou o lote. Nenhum item foi confirmado." }, 502);
  }

  const insertedByKey = new Map<string, string>(
    (data ?? []).flatMap((row: { id?: string; import_key?: string | null }) =>
      row.id && row.import_key ? [[row.import_key, row.id] as [string, string]] : [],
    ),
  );
  if (insertedByKey.size !== prepared.length) {
    console.error("[Question ingest] Batch insert returned an incomplete result.");
    return json({ ok: false, error: "O banco não confirmou todos os itens do lote." }, 502);
  }

  return json({
    ok: true,
    status: "inserted",
    count: prepared.length,
    questions: importedResults(prepared, insertedByKey, "inserted"),
  }, 201);
}

export const Route = createFileRoute("/api/question-ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.QUESTION_INGEST_TOKEN;
        if (!token || token.length < 32) {
          return json({ ok: false, error: "A ingestão não está configurada no servidor." }, 503);
        }
        if (request.headers.get("authorization") !== "Bearer " + token) {
          return json({ ok: false, error: "Credencial inválida." }, 401);
        }
        if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
          return json({ ok: false, error: "Envie o conteúdo como application/json." }, 415);
        }

        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > MAX_BODY_BYTES) {
          return json({ ok: false, error: "O conteúdo excede o limite permitido." }, 413);
        }

        let rawBody: string;
        try {
          rawBody = await request.text();
        } catch {
          return json({ ok: false, error: "Não foi possível ler o conteúdo enviado." }, 400);
        }
        if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
          return json({ ok: false, error: "O conteúdo excede o limite permitido." }, 413);
        }

        let input: unknown;
        try {
          input = JSON.parse(rawBody);
        } catch {
          return json({ ok: false, error: "O corpo precisa conter JSON válido." }, 400);
        }

        const issueValidation = issueRequestSchema.safeParse(input);
        const batchValidation = batchRequestSchema.safeParse(input);
        if (!issueValidation.success && !batchValidation.success) {
          const error = typeof input === "object" && input !== null && "batch" in input
            ? batchValidation.error
            : issueValidation.error;
          return json({
            ok: false,
            error: "Os dados não passaram pela validação.",
            details: validationDetails(error),
          }, 422);
        }

        try {
          return issueValidation.success
            ? await importIssueQuestion(issueValidation.data)
            : await importQuestionBatch(batchValidation.data!);
        } catch (error) {
          console.error("[Question ingest] Unexpected server error:", error);
          return json({ ok: false, error: "O servidor não conseguiu processar os dados." }, 500);
        }
      },
    },
  },
});
