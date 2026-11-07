/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Internal review data is reachable only through these server functions.
// The shared password (REVIEW_PASSWORD) and the service_role key never leave the server.

type ReviewSession = { unlocked?: boolean };

function sessionConfig() {
  const password = process.env["REVIEW_SESSION_SECRET"];
  if (!password) throw new Error("REVIEW_SESSION_SECRET não configurado.");
  return {
    password,
    name: "revisao-interna",
    maxAge: 60 * 60 * 8, // 8 horas
    cookie: { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/" },
  };
}

function passwordMatches(input: string, expected: string) {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

// Acesso aberto: a revisão interna não exige mais senha (decisão do usuário).
async function requireUnlocked() {}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

export const getReviewAccess = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<ReviewSession>(sessionConfig());
  return { unlocked: session.data.unlocked === true };
});

export const unlockReview = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ password: z.string().min(1).max(500) }).parse(data))
  .handler(async ({ data }) => {
    const expected = process.env["REVIEW_PASSWORD"];
    if (!expected) throw new Error("REVIEW_PASSWORD não configurado.");
    if (!passwordMatches(data.password, expected)) return { ok: false as const };
    const session = await useSession<ReviewSession>(sessionConfig());
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const lockReview = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<ReviewSession>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});

const CRITERIA = ["texto_base", "enunciado", "alternativas", "gabarito", "imagens", "formatacao", "dados_prova", "classificacao"] as const;
const STATUSES = ["pendente", "precisa_ajuste", "ajustado_pendente_conferencia", "conferido_ok", "nao_se_aplica", "duvida"] as const;
const OPEN_STATUSES = ["pendente", "precisa_ajuste", "ajustado_pendente_conferencia", "duvida"] as const;
const PENDING_STATUSES = ["pendente"] as const;
const NEEDS_ATTENTION_STATUSES = ["precisa_ajuste", "ajustado_pendente_conferencia", "duvida"] as const;
const QUESTION_ID_BATCH_SIZE = 80;
const REVIEW_QUEUE_COLUMNS_FOR_STATS = "id,ano,prova,instituicao,enunciado,referencia_texto,referencia_texto_apos,referencia_fonte,fonte,is_complete";

const QueueInput = z.object({
  columns: z.string().regex(/^[a-z_,]+$/).max(1000),
  mode: z.enum(["pending", "needs_adjustment", "completed", "all"]),
  criterion: z.enum(CRITERIA).nullable().optional(),
  criterionStatus: z.enum(["all_open", ...OPEN_STATUSES]).optional(),
  term: z.string().max(200),
  anos: z.array(z.string().max(100)).max(200),
  provas: z.array(z.string().max(300)).max(500),
  instituicoes: z.array(z.string().max(300)).max(500),
  from: z.number().int().min(0),
  to: z.number().int().min(0),
});

const CriterionStatsInput = z.object({
  term: z.string().max(200),
  anos: z.array(z.string().max(100)).max(200),
  provas: z.array(z.string().max(300)).max(500),
  instituicoes: z.array(z.string().max(300)).max(500),
});

export const listReviewQueue = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => QueueInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const db = await admin();
    const criterion = data.criterion ?? null;
    const criterionStatus = data.criterionStatus ?? "pendente";

    if (data.mode === "pending" || data.mode === "needs_adjustment") {
      const modeStatuses = data.mode === "pending" ? PENDING_STATUSES : NEEDS_ATTENTION_STATUSES;
      const matchingIds = new Set(await getQuestionIdsWithReviewStatus(db, null, modeStatuses));

      if (data.mode === "needs_adjustment") {
        const pendingIds = new Set(await getQuestionIdsWithReviewStatus(db, null, PENDING_STATUSES));
        for (const id of pendingIds) matchingIds.delete(id);
      }

      if (data.mode === "pending" && (criterion !== null || (criterionStatus !== "pendente" && criterionStatus !== "all_open"))) {
        const selectedStatuses = criterionStatus === "all_open" ? OPEN_STATUSES : [criterionStatus];
        const selectedIds = new Set(await getQuestionIdsWithReviewStatus(db, criterion, selectedStatuses));
        for (const id of matchingIds) {
          if (!selectedIds.has(id)) matchingIds.delete(id);
        }
      }

      const questionIds = [...matchingIds];
      if (questionIds.length === 0) return { rows: [], count: 0 };

      const matchingRows: Record<string, any>[] = [];
      for (const ids of chunk(questionIds, QUESTION_ID_BATCH_SIZE)) {
        let request = db.from("question_review_queue").select(data.columns).in("id", ids);
        request = applyQueueFilters(request, data).eq("is_complete", false);
        const { data: rows, error } = await request
          .order("ano", { ascending: false })
          .order("numero", { ascending: true })
          .range(0, ids.length - 1);
        if (error) throw new Error(error.message);
        matchingRows.push(...(rows ?? []) as Record<string, any>[]);
      }

      matchingRows.sort(compareQueueRows);
      return {
        rows: matchingRows.slice(data.from, data.to + 1),
        count: matchingRows.length,
      };
    }

    let request = db.from("question_review_queue").select(data.columns, { count: "exact" });
    if (data.mode === "completed") request = request.eq("is_complete", true);
    request = applyQueueFilters(request, data);
    const { data: rows, count, error } = await request
      .order("ano", { ascending: false })
      .order("numero", { ascending: true })
      .range(data.from, data.to);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as Record<string, any>[], count: (count ?? 0) as number };
  });

function applyQueueFilters(request: any, filters: { term: string; anos: string[]; provas: string[]; instituicoes: string[] }) {
  const term = sanitizeSearchTerm(filters.term);
  if (term) {
    request = request.or(
      ["enunciado", "referencia_texto", "referencia_texto_apos", "referencia_fonte", "fonte"]
        .map((column) => `${column}.ilike.%${term}%`).join(","),
    );
  }
  if (filters.anos.length) request = request.in("ano", filters.anos);
  if (filters.provas.length) request = request.in("prova", filters.provas);
  if (filters.instituicoes.length) request = request.in("instituicao", filters.instituicoes);
  return request;
}

function sanitizeSearchTerm(value: string) {
  return value.replace(/[^a-zA-ZÀ-ÿ0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

async function getQuestionIdsWithReviewStatus(
  db: any,
  criterion: typeof CRITERIA[number] | null,
  statuses: readonly (typeof STATUSES)[number][],
) {
  const ids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    let request = db.from("question_review_checks").select("question_id").in("status", [...statuses]);
    if (criterion) request = request.eq("criterio", criterion);
    const { data, error } = await request.range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (typeof row.question_id === "string") ids.add(row.question_id);
    }
    if ((data ?? []).length < 1000) break;
  }
  return [...ids];
}

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function compareQueueRows(a: Record<string, any>, b: Record<string, any>) {
  const yearComparison = String(b.ano ?? "").localeCompare(String(a.ano ?? ""), "pt-BR", { numeric: true });
  if (yearComparison !== 0) return yearComparison;
  return String(a.numero ?? "").localeCompare(String(b.numero ?? ""), "pt-BR", { numeric: true });
}

export const getReviewCriterionStats = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CriterionStatsInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const db = await admin();
    const questions: Record<string, any>[] = [];
    for (let from = 0; ; from += 500) {
      let request = db.from("question_review_queue").select(REVIEW_QUEUE_COLUMNS_FOR_STATS);
      request = applyQueueFilters(request, data);
      const { data: rows, error } = await request
        .order("ano", { ascending: false })
        .order("numero", { ascending: true })
        .range(from, from + 499);
      if (error) throw new Error(error.message);
      questions.push(...(rows ?? []) as Record<string, any>[]);
      if ((rows ?? []).length < 500) break;
    }

    const byCriterion = Object.fromEntries(CRITERIA.map((criterion) => [
      criterion,
      Object.fromEntries(STATUSES.map((status) => [status, 0])),
    ])) as Record<typeof CRITERIA[number], Record<typeof STATUSES[number], number>>;
    const questionIdsByStatus = Object.fromEntries(STATUSES.map((status) => [status, new Set<string>()])) as Record<typeof STATUSES[number], Set<string>>;
    const checksByQuestion = new Map<string, Array<{ criterion: typeof CRITERIA[number]; status: typeof STATUSES[number] }>>();

    for (const ids of chunk(questions.map((question) => String(question.id)), QUESTION_ID_BATCH_SIZE)) {
      const { data: checks, error } = await db.from("question_review_checks")
        .select("question_id,criterio,status")
        .in("question_id", ids);
      if (error) throw new Error(error.message);
      for (const check of checks ?? []) {
        const criterion = check.criterio as typeof CRITERIA[number];
        const status = check.status as typeof STATUSES[number];
        const questionId = typeof check.question_id === "string" ? check.question_id : "";
        if (!questionId || !(CRITERIA as readonly string[]).includes(criterion) || !(STATUSES as readonly string[]).includes(status)) continue;
        const questionChecks = checksByQuestion.get(questionId) ?? [];
        questionChecks.push({ criterion, status });
        checksByQuestion.set(questionId, questionChecks);
      }
    }

    const pendingQuestionIds = new Set<string>();
    let completed = 0;
    for (const question of questions) {
      const questionId = String(question.id);
      const checks = checksByQuestion.get(questionId) ?? [];
      if (checks.length < CRITERIA.length || checks.some((check) => check.status === "pendente")) {
        pendingQuestionIds.add(questionId);
      } else if (question.is_complete === true) {
        completed += 1;
      }
    }

    for (const questionId of pendingQuestionIds) {
      for (const check of checksByQuestion.get(questionId) ?? []) {
        byCriterion[check.criterion][check.status] += 1;
        questionIdsByStatus[check.status].add(questionId);
      }
    }

    const pending = pendingQuestionIds.size;
    return {
      total: questions.length,
      completed,
      pending,
      needsAdjustment: Math.max(0, questions.length - completed - pending),
      byStatus: Object.fromEntries(STATUSES.map((status) => [status, questionIdsByStatus[status].size])),
      byCriterion,
    };
  });

export const getReviewMetadata = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ questionId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const db = await admin();
    const [checks, history] = await Promise.all([
      db.from("question_review_checks").select("*").eq("question_id", data.questionId).order("criterio"),
      db.from("question_review_history").select("*").eq("question_id", data.questionId)
        .order("changed_at", { ascending: false }).limit(60),
    ]);
    if (checks.error) throw new Error(checks.error.message);
    if (history.error) throw new Error(history.error.message);
    return {
      checks: (checks.data ?? []) as Record<string, any>[],
      history: (history.data ?? []) as Record<string, any>[],
    };
  });

export const updateReviewCheckFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({
    questionId: z.string().uuid(),
    criterio: z.enum(CRITERIA),
    status: z.enum(STATUSES),
    observacao: z.string().max(5000),
  }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const db = await admin();
    const { data: row, error } = await db.from("question_review_checks")
      .update({ status: data.status, observacao: data.observacao })
      .eq("question_id", data.questionId)
      .eq("criterio", data.criterio)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as Record<string, any>;
  });

export const markQuestionReviewedFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({
    questionId: z.string().uuid(),
  }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const db = await admin();
    const { data: checks, error: checksError } = await db
      .from("question_review_checks")
      .select("criterio")
      .eq("question_id", data.questionId);

    if (checksError) throw new Error(checksError.message);
    const availableCriteria = new Set((checks ?? []).map((check: { criterio: string }) => check.criterio));
    if (CRITERIA.some((criterion) => !availableCriteria.has(criterion))) {
      throw new Error("Checklist incompleto para esta questão.");
    }

    const { data: updatedChecks, error } = await db
      .from("question_review_checks")
      .update({ status: "conferido_ok" })
      .eq("question_id", data.questionId)
      .neq("status", "conferido_ok")
      .select("criterio");

    if (error) throw new Error(error.message);
    return { updatedCount: updatedChecks?.length ?? 0 };
  });
