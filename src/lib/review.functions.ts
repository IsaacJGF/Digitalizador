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

async function requireUnlocked() {
  const session = await useSession<ReviewSession>(sessionConfig());
  if (!session.data.unlocked) throw new Error("REVIEW_LOCKED");
}

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

const QueueInput = z.object({
  columns: z.string().regex(/^[a-z_,]+$/).max(1000),
  mode: z.enum(["pending", "changed", "all"]).or(z.string()),
  term: z.string().max(200),
  anos: z.array(z.string().max(100)).max(200),
  provas: z.array(z.string().max(300)).max(500),
  instituicoes: z.array(z.string().max(300)).max(500),
  from: z.number().int().min(0),
  to: z.number().int().min(0),
});

export const listReviewQueue = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => QueueInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const db = await admin();
    let request = db.from("question_review_queue").select(data.columns, { count: "exact" });
    if (data.mode === "pending") request = request.eq("is_complete", false);
    if (data.mode === "changed") request = request.gt("adjustment_count", 0);
    const term = data.term.replace(/[^a-zA-ZÀ-ÿ0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
    if (term) {
      request = request.or(
        ["enunciado", "referencia_texto", "referencia_texto_apos", "referencia_fonte", "fonte"]
          .map((c) => `${c}.ilike.%${term}%`).join(","),
      );
    }
    if (data.anos.length) request = request.in("ano", data.anos);
    if (data.provas.length) request = request.in("prova", data.provas);
    if (data.instituicoes.length) request = request.in("instituicao", data.instituicoes);
    const { data: rows, count, error } = await request
      .order("ano", { ascending: false })
      .order("numero", { ascending: true })
      .range(data.from, data.to);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as Record<string, unknown>[], count: (count ?? 0) as number };
  });

export const getReviewStats = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const db = await admin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const count = async (filter?: (q: any) => any) => {
    let request = db.from("question_review_summary").select("question_id", { count: "exact", head: true });
    if (filter) request = filter(request);
    const result = await request;
    if (result.error) throw new Error(result.error.message);
    return (result.count ?? 0) as number;
  };
  const [total, completed, pending, changed] = await Promise.all([
    count(),
    count((q) => q.eq("is_complete", true)),
    count((q) => q.eq("is_complete", false)),
    count((q) => q.gt("adjustment_count", 0)),
  ]);
  return { total, completed, pending, changed };
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
      checks: (checks.data ?? []) as Record<string, unknown>[],
      history: (history.data ?? []) as Record<string, unknown>[],
    };
  });

const CRITERIA = ["texto_base", "enunciado", "alternativas", "gabarito", "imagens", "formatacao", "dados_prova", "classificacao"] as const;
const STATUSES = ["pendente", "precisa_ajuste", "ajustado_pendente_conferencia", "conferido_ok", "nao_se_aplica", "duvida"] as const;

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
    return row as Record<string, unknown>;
  });
