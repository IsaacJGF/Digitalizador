import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const MAX_BODY_BYTES = 400_000;
const MAX_REVIEW_BATCH = 25;

const CATALOG_TABLES = [
  "catalog_areas",
  "catalog_conteudos",
  "catalog_subconteudos",
  "catalog_relacionados",
  "catalog_tags",
  "catalog_provas",
  "catalog_instituicoes",
] as const;

const CATALOG_SELECTS: Record<string, string> = {
  catalog_areas: "id,nome",
  catalog_conteudos: "id,nome,area_id",
  catalog_subconteudos: "id,nome,conteudo_id",
  catalog_relacionados: "id,nome",
  catalog_tags: "id,nome",
  catalog_provas: "id,nome",
  catalog_instituicoes: "id,nome",
};

const REVIEW_COLUMNS = [
  "id",
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
  "referencia_texto_apos",
  "referencia_fonte",
  "referencia_imagem",
  "referencia_imagem_pos",
  "referencia_imagem_layout",
  "referencia_imagens_extra",
  "enunciado_imagem",
  "enunciado_imagem_pos",
  "enunciado_imagem_layout",
  "enunciado_imagens_extra",
  "imagem_original_url",
  "tem_equacao",
  "tem_imagem",
  "grupo_id",
  "created_at",
  "updated_at",
].join(",");

const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();

const alternativeSchema = z.object({
  letra: z.string().trim().regex(/^[A-Z]$/),
  texto: z.string().max(12_000),
}).strict();

const alternativesSchema = z.array(alternativeSchema).min(2).max(10).superRefine((alternatives, context) => {
  const letters = alternatives.map((alternative) => alternative.letra);
  if (new Set(letters).size !== letters.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "As letras das alternativas precisam ser únicas.",
    });
  }
});

const changesSchema = z.object({
  numero: nullableText(40),
  enunciado: z.string().max(30_000).refine((value) => value.trim().length > 0, "O enunciado não pode ficar vazio.").optional(),
  alternativas: alternativesSchema.optional(),
  tipo: z.string().trim().min(1).max(50).optional(),
  resposta: z.string().trim().regex(/^[A-Z]$/).nullable().optional(),
  fonte: nullableText(1_000),
  area_geral: nullableText(200),
  conteudo_principal: nullableText(200),
  subconteudo_principal: nullableText(200),
  conteudos_relacionados: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  tags_livres: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  dificuldade: nullableText(50),
  ano: nullableText(20),
  prova: nullableText(100),
  instituicao: nullableText(200),
  observacoes: nullableText(3_000),
  referencia_texto: z.string().max(40_000).nullable().optional(),
  referencia_texto_apos: z.string().max(40_000).nullable().optional(),
  referencia_fonte: nullableText(1_000),
  tem_equacao: z.boolean().optional(),
}).strict().refine((changes) => Object.keys(changes).length > 0, {
  message: "Informe ao menos um campo para corrigir.",
});

const reviewUpdateSchema = z.object({
  id: z.string().uuid(),
  expected_updated_at: z.string().min(1).max(40),
  changes: changesSchema,
}).strict();

const reviewRequestSchema = z.object({
  updates: z.array(reviewUpdateSchema).min(1).max(MAX_REVIEW_BATCH),
}).strict().superRefine((request, context) => {
  const ids = request.updates.map((update) => update.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["updates"],
      message: "Cada questão pode aparecer somente uma vez no lote.",
    });
  }
});

type ReviewUpdate = z.infer<typeof reviewUpdateSchema>;
type QuestionRow = Record<string, unknown> & {
  id: string;
  updated_at: string;
  grupo_id: string | null;
};
type CatalogRow = {
  id: string;
  nome: string;
  area_id?: string | null;
  conteudo_id?: string | null;
};
type CatalogMap = Record<string, CatalogRow[]>;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function authorize(request: Request): Response | null {
  const token = process.env.QUESTION_INGEST_TOKEN;
  if (!token || token.length < 32) {
    return json({ ok: false, error: "A integração de revisão não está configurada no servidor." }, 503);
  }
  if (request.headers.get("authorization") !== "Bearer " + token) {
    return json({ ok: false, error: "Credencial inválida." }, 401);
  }
  return null;
}

function getFilterValues(params: URLSearchParams, name: string): string[] {
  return params.getAll(name)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeName(value: string): string {
  return value.trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function hasField(value: object, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function findCatalogRows(catalogs: CatalogMap, table: string, name: unknown): CatalogRow[] {
  if (typeof name !== "string" || !name.trim()) return [];
  return (catalogs[table] ?? []).filter((row) =>
    typeof row.nome === "string" && normalizeName(row.nome) === normalizeName(name),
  );
}

function findCatalogRow(catalogs: CatalogMap, table: string, name: unknown): CatalogRow | undefined {
  return findCatalogRows(catalogs, table, name)[0];
}

function canonicalCatalogName(catalogs: CatalogMap, table: string, name: string, label: string): string {
  const row = findCatalogRow(catalogs, table, name);
  if (!row?.nome) throw new Error(label + " não corresponde a uma opção ativa do catálogo: " + name);
  return row.nome;
}

function canonicalCatalogArray(
  catalogs: CatalogMap,
  table: string,
  values: string[],
  label: string,
): string[] {
  const byNormalizedName = new Map<string, string>();
  for (const value of values) {
    const name = canonicalCatalogName(catalogs, table, value, label);
    byNormalizedName.set(normalizeName(name), name);
  }
  return [...byNormalizedName.values()];
}

function requiredCatalogTables(updates: ReviewUpdate[]): Set<string> {
  const tables = new Set<string>();
  for (const { changes } of updates) {
    if (["area_geral", "conteudo_principal", "subconteudo_principal"].some((field) => hasField(changes, field))) {
      tables.add("catalog_areas");
      tables.add("catalog_conteudos");
      tables.add("catalog_subconteudos");
    }
    if (hasField(changes, "conteudos_relacionados")) tables.add("catalog_relacionados");
    if (hasField(changes, "tags_livres")) tables.add("catalog_tags");
    if (hasField(changes, "prova")) tables.add("catalog_provas");
    if (hasField(changes, "instituicao")) tables.add("catalog_instituicoes");
  }
  return tables;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadActiveCatalogs(db: any, tables: Set<string>): Promise<CatalogMap> {
  const results = await Promise.all([...tables].map(async (table) => {
    const select = CATALOG_SELECTS[table];
    if (!select) throw new Error("Tabela de catálogo não permitida.");
    const { data, error } = await db.from(table).select(select).eq("ativo", true);
    return { table, data, error };
  }));
  const failed = results.find((result) => result.error);
  if (failed) throw new Error("Não foi possível consultar o catálogo " + failed.table + ".");
  return Object.fromEntries(results.map((result) => [result.table, (result.data ?? []) as CatalogRow[]]));
}

function canonicalizeChanges(
  existing: QuestionRow,
  changes: z.infer<typeof changesSchema>,
  catalogs: CatalogMap,
): Record<string, unknown> {
  const canonical: Record<string, unknown> = { ...changes };

  if (hasField(changes, "conteudos_relacionados")) {
    canonical.conteudos_relacionados = canonicalCatalogArray(
      catalogs,
      "catalog_relacionados",
      changes.conteudos_relacionados ?? [],
      "Conteúdo relacionado",
    );
  }
  if (hasField(changes, "tags_livres")) {
    canonical.tags_livres = canonicalCatalogArray(
      catalogs,
      "catalog_tags",
      changes.tags_livres ?? [],
      "Tag",
    );
  }
  if (hasField(changes, "prova") && changes.prova !== null) {
    canonical.prova = canonicalCatalogName(catalogs, "catalog_provas", changes.prova, "Prova");
  }
  if (hasField(changes, "instituicao") && changes.instituicao !== null) {
    canonical.instituicao = canonicalCatalogName(catalogs, "catalog_instituicoes", changes.instituicao, "Instituição");
  }

  const classificationFields = ["area_geral", "conteudo_principal", "subconteudo_principal"];
  const classificationChanged = classificationFields.some((field) => hasField(changes, field));
  if (!classificationChanged) return canonical;

  const areaName = hasField(changes, "area_geral")
    ? changes.area_geral
    : nullableString(existing.area_geral) ?? nullableString(existing.disciplina);
  const contentName = hasField(changes, "conteudo_principal")
    ? changes.conteudo_principal
    : nullableString(existing.conteudo_principal) ?? nullableString(existing.conteudo);
  const subcontentName = hasField(changes, "subconteudo_principal")
    ? changes.subconteudo_principal
    : nullableString(existing.subconteudo_principal);

  const areaRow = areaName ? findCatalogRow(catalogs, "catalog_areas", areaName) : undefined;
  if (areaName && !areaRow) {
    throw new Error("A classificação final precisa usar uma área geral ativa.");
  }

  let contentRow: CatalogRow | undefined;
  if (contentName) {
    if (!areaRow) throw new Error("Selecione uma área geral antes de manter um conteúdo principal.");
    const namedContentRows = findCatalogRows(catalogs, "catalog_conteudos", contentName);
    contentRow = namedContentRows.find((row) => row.area_id === areaRow.id);
    if (!contentRow) {
      throw new Error(namedContentRows.length
        ? "O conteúdo principal não pertence à área geral informada."
        : "O conteúdo principal não corresponde a uma opção ativa do catálogo.");
    }
  }

  let subcontentRow: CatalogRow | undefined;
  if (subcontentName) {
    if (!contentRow) throw new Error("Selecione um conteúdo principal antes de manter um subconteúdo.");
    const namedSubcontentRows = findCatalogRows(catalogs, "catalog_subconteudos", subcontentName);
    subcontentRow = namedSubcontentRows.find((row) => row.conteudo_id === contentRow?.id);
    if (!subcontentRow) {
      throw new Error(namedSubcontentRows.length
        ? "O subconteúdo não pertence ao conteúdo principal informado."
        : "O subconteúdo não corresponde a uma opção ativa do catálogo.");
    }
  }

  if (hasField(changes, "area_geral")) canonical.area_geral = areaRow?.nome ?? null;
  if (hasField(changes, "conteudo_principal")) canonical.conteudo_principal = contentRow?.nome ?? null;
  if (hasField(changes, "subconteudo_principal")) canonical.subconteudo_principal = subcontentRow?.nome ?? null;

  return canonical;
}

function buildQuestionPatch(
  existing: QuestionRow,
  changes: z.infer<typeof changesSchema>,
  canonical: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const writableFields = [
    "numero",
    "enunciado",
    "alternativas",
    "tipo",
    "resposta",
    "fonte",
    "area_geral",
    "conteudo_principal",
    "subconteudo_principal",
    "conteudos_relacionados",
    "tags_livres",
    "dificuldade",
    "ano",
    "prova",
    "instituicao",
    "observacoes",
    "referencia_texto",
    "referencia_texto_apos",
    "referencia_fonte",
    "tem_equacao",
  ];

  for (const field of writableFields) {
    if (!hasField(changes, field)) continue;
    if (field === "alternativas") {
      const oldAlternatives = Array.isArray(existing.alternativas)
        ? existing.alternativas as Array<Record<string, unknown>>
        : [];
      const newAlternatives = changes.alternativas ?? [];
      patch.alternativas = newAlternatives.map((alternative) => {
        const old = oldAlternatives.find((item) => item.letra === alternative.letra);
        return {
          letra: alternative.letra,
          texto: alternative.texto,
          ...(typeof old?.imagem === "string" && old.imagem ? { imagem: old.imagem } : {}),
        };
      });
    } else {
      patch[field] = canonical[field];
    }
  }

  if (hasField(changes, "area_geral")) patch.disciplina = canonical.area_geral;
  if (hasField(changes, "conteudo_principal")) patch.conteudo = canonical.conteudo_principal;
  if (hasField(changes, "tags_livres")) patch.tags = canonical.tags_livres;

  return patch;
}

function fieldSnapshot(row: QuestionRow, fields: string[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
}

function hasSharedReferenceChange(update: ReviewUpdate): boolean {
  return ["referencia_texto", "referencia_texto_apos", "referencia_fonte"]
    .some((field) => hasField(update.changes, field));
}

export const Route = createFileRoute("/api/question-review")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authResponse = authorize(request);
        if (authResponse) return authResponse;

        const params = new URL(request.url).searchParams;
        const ids = getFilterValues(params, "ids");
        const anos = getFilterValues(params, "ano");
        const provas = getFilterValues(params, "prova");
        const instituicoes = getFilterValues(params, "instituicao");
        const numero = params.get("numero")?.trim() || null;
        const grupoId = params.get("grupo_id")?.trim() || null;
        const includeCatalogs = ["true", "1"].includes((params.get("incluir_catalogos") ?? "").toLowerCase());
        const limit = Number(params.get("limit") ?? 10);
        const offset = Number(params.get("offset") ?? 0);
        const hasQuestionFilters = ids.length > 0 || anos.length > 0 || provas.length > 0 ||
          instituicoes.length > 0 || Boolean(numero || grupoId);

        if (!hasQuestionFilters && !includeCatalogs) {
          return json({ ok: false, error: "Informe IDs, filtros de prova/ano, número ou grupo_id. Use incluir_catalogos=true para consultar somente os catálogos." }, 400);
        }
        if (ids.length > MAX_REVIEW_BATCH) {
          return json({ ok: false, error: "A busca aceita no máximo 25 IDs por chamada." }, 400);
        }
        if (ids.some((id) => !z.string().uuid().safeParse(id).success)) {
          return json({ ok: false, error: "Todos os IDs precisam ser UUIDs válidos." }, 400);
        }
        if (![limit, offset].every(Number.isSafeInteger) || limit < 1 || limit > MAX_REVIEW_BATCH || offset < 0) {
          return json({ ok: false, error: "Use limit entre 1 e 25 e offset igual ou maior que zero." }, 400);
        }
        if (grupoId && !z.string().uuid().safeParse(grupoId).success) {
          return json({ ok: false, error: "grupo_id precisa ser um UUID válido." }, 400);
        }
        if (ids.length > 0 && (anos.length || provas.length || instituicoes.length || numero || grupoId)) {
          return json({ ok: false, error: "Use IDs ou filtros, sem combinar os dois formatos." }, 400);
        }

        try {
          // Import inside the request handler so the service-role client never enters the browser bundle.
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabaseAdmin as any;
          let questions: QuestionRow[] = [];
          let total = 0;

          if (hasQuestionFilters) {
            let query = db.from("questions").select(REVIEW_COLUMNS, { count: "exact" });
            if (ids.length) query = query.in("id", ids);
            if (anos.length) query = query.in("ano", anos);
            if (provas.length) query = query.in("prova", provas);
            if (instituicoes.length) query = query.in("instituicao", instituicoes);
            if (numero) query = query.eq("numero", numero);
            if (grupoId) query = query.eq("grupo_id", grupoId);

            const { data, count, error } = await query
              .order("ano", { ascending: false })
              .order("numero", { ascending: true })
              .range(offset, offset + limit - 1);
            if (error) {
              console.error("[Question review] Read failed:", error.code);
              return json({ ok: false, error: "Não foi possível consultar as questões." }, 502);
            }
            questions = (data ?? []) as QuestionRow[];
            total = count ?? 0;
          }

          let catalogs: CatalogMap | undefined;
          if (includeCatalogs) {
            catalogs = await loadActiveCatalogs(db, new Set<string>(CATALOG_TABLES));
          }

          return json({
            ok: true,
            questions,
            pagination: {
              total,
              limit,
              offset,
              has_more: total > offset + questions.length,
            },
            ...(catalogs ? { catalogos: catalogs } : {}),
          });
        } catch (error) {
          console.error("[Question review] Unexpected read error:", error);
          return json({ ok: false, error: "O servidor não conseguiu consultar questões e catálogos." }, 500);
        }
      },
      PATCH: async ({ request }) => {
        const authResponse = authorize(request);
        if (authResponse) return authResponse;

        if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
          return json({ ok: false, error: "Envie o conteúdo como application/json." }, 415);
        }
        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
          return json({ ok: false, error: "O lote excede o limite permitido." }, 413);
        }

        let rawBody: string;
        try {
          rawBody = await request.text();
        } catch {
          return json({ ok: false, error: "Não foi possível ler o lote." }, 400);
        }
        if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
          return json({ ok: false, error: "O lote excede o limite permitido." }, 413);
        }

        let input: unknown;
        try {
          input = JSON.parse(rawBody);
        } catch {
          return json({ ok: false, error: "O corpo precisa conter JSON válido." }, 400);
        }

        const validation = reviewRequestSchema.safeParse(input);
        if (!validation.success) {
          const details = validation.error.issues
            .slice(0, 10)
            .map((issue) => issue.path.join(".") + ": " + issue.message);
          return json({ ok: false, error: "As correções não passaram pela validação.", details }, 422);
        }

        const updates = validation.data.updates;
        const referenceFields = ["referencia_texto", "referencia_texto_apos", "referencia_fonte"];
        try {
          // Import inside the request handler so the service-role client never enters the browser bundle.
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabaseAdmin as any;
          const ids = updates.map((update) => update.id);
          const { data: existingRows, error: lookupError } = await db
            .from("questions")
            .select(REVIEW_COLUMNS)
            .in("id", ids);
          if (lookupError) {
            console.error("[Question review] Lookup failed:", lookupError.code);
            return json({ ok: false, error: "Não foi possível consultar as questões para aplicar as correções." }, 502);
          }
          const existingById = new Map<string, QuestionRow>(
            ((existingRows ?? []) as QuestionRow[]).map((row) => [String(row.id), row]),
          );

          const referenceGroupIds = new Set<string>();
          for (const update of updates) {
            const existing = existingById.get(update.id);
            if (existing?.grupo_id && hasSharedReferenceChange(update)) {
              referenceGroupIds.add(String(existing.grupo_id));
            }
          }

          for (const groupId of referenceGroupIds) {
            const { data: groupRows, error: groupError } = await db
              .from("questions")
              .select("id")
              .eq("grupo_id", groupId);
            if (groupError) {
              console.error("[Question review] Group lookup failed:", groupError.code);
              return json({ ok: false, error: "Não foi possível conferir os itens da referência compartilhada." }, 502);
            }

            const groupIds = new Set<string>(((groupRows ?? []) as Array<{ id: string }>).map((row) => row.id));
            const groupUpdates = updates.filter((update) => groupIds.has(update.id));
            if (groupUpdates.length !== groupIds.size) {
              return json({
                ok: false,
                error: "A referência é compartilhada. Inclua todos os itens do grupo na mesma chamada de correção.",
                grupo_id: groupId,
                ids_necessarios: [...groupIds],
              }, 409);
            }

            for (const field of referenceFields) {
              const changedValues = groupUpdates.filter((update) => hasField(update.changes, field));
              if (changedValues.length > 0) {
                const values = changedValues.map((update) =>
                  (update.changes as unknown as Record<string, unknown>)[field],
                );
                if (
                  changedValues.length !== groupUpdates.length ||
                  new Set(values.map((value) => JSON.stringify(value))).size !== 1
                ) {
                  return json({
                    ok: false,
                    error: "Os campos de texto-base compartilhados precisam ter o mesmo valor em todos os itens do grupo.",
                    grupo_id: groupId,
                    campo: field,
                  }, 422);
                }
              }
            }
          }

          const catalogs = await loadActiveCatalogs(db, requiredCatalogTables(updates));
          const staleSharedGroups = new Set<string>();
          for (const update of updates) {
            const existing = existingById.get(update.id);
            if (
              existing?.grupo_id &&
              hasSharedReferenceChange(update) &&
              existing.updated_at !== update.expected_updated_at
            ) {
              staleSharedGroups.add(String(existing.grupo_id));
            }
          }

          const results: Record<string, unknown>[] = [];
          for (const update of updates) {
            const existing = existingById.get(update.id);
            if (!existing) {
              results.push({ id: update.id, status: "not_found" });
              continue;
            }

            const sharedReferenceBatchIsStale = Boolean(
              existing.grupo_id &&
              hasSharedReferenceChange(update) &&
              staleSharedGroups.has(String(existing.grupo_id)),
            );
            if (existing.updated_at !== update.expected_updated_at || sharedReferenceBatchIsStale) {
              results.push({
                id: update.id,
                status: "conflict",
                expected_updated_at: update.expected_updated_at,
                current_updated_at: existing.updated_at,
              });
              continue;
            }

            try {
              const canonical = canonicalizeChanges(existing, update.changes, catalogs);
              const patch = buildQuestionPatch(existing, update.changes, canonical);
              const finalAlternatives = (
                patch.alternativas ?? existing.alternativas
              ) as Array<{ letra?: string; texto?: string; imagem?: string | null }>;
              const finalAnswer = hasField(update.changes, "resposta")
                ? update.changes.resposta
                : existing.resposta;
              if (
                typeof finalAnswer === "string" &&
                !finalAlternatives.some((alternative) => alternative.letra === finalAnswer)
              ) {
                throw new Error("O gabarito precisa corresponder a uma alternativa existente.");
              }

              const before = fieldSnapshot(existing, Object.keys(update.changes));
              const { data: updated, error } = await db
                .from("questions")
                .update(patch)
                .eq("id", update.id)
                .eq("updated_at", update.expected_updated_at)
                .select(REVIEW_COLUMNS)
                .maybeSingle();
              if (error) {
                console.error("[Question review] Update failed:", error.code);
                results.push({ id: update.id, status: "failed", error: "Falha ao gravar as correções." });
                continue;
              }
              if (!updated) {
                results.push({
                  id: update.id,
                  status: "conflict",
                  expected_updated_at: update.expected_updated_at,
                  message: "A questão foi alterada durante a revisão. Consulte-a novamente antes de aplicar mudanças.",
                });
                continue;
              }

              results.push({
                id: update.id,
                status: "updated",
                changed_fields: Object.keys(update.changes),
                before,
                after: fieldSnapshot(updated as QuestionRow, Object.keys(update.changes)),
                updated_at: updated.updated_at,
              });
            } catch (error) {
              results.push({
                id: update.id,
                status: "invalid",
                error: error instanceof Error ? error.message : "A correção não passou pela validação.",
              });
            }
          }

          return json({
            ok: results.every((result) => result.status === "updated"),
            results,
          });
        } catch (error) {
          console.error("[Question review] Unexpected update error:", error);
          return json({ ok: false, error: "O servidor não conseguiu aplicar as correções." }, 500);
        }
      },
    },
  },
});
