import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const REPOSITORY = "IsaacJGF/Digitalizador";
const AUTHORIZED_AUTHOR = "IsaacJGFerreira";
const MAX_BODY_BYTES = 100_000;

const optionalText = (maxLength: number) =>
  z.string().trim().max(maxLength).nullable().optional();

const alternativeSchema = z
  .object({
    letra: z.string().trim().regex(/^[A-Z]$/),
    texto: z.string().trim().min(1).max(10_000),
  })
  .strict();

const referenceBlockSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("texto"), texto: z.string().max(40_000) }).strict(),
  z.object({ tipo: z.literal("imagem") }).strict(),
]);

const questionSchema = z
  .object({
    numero: optionalText(40),
    enunciado: z.string().trim().min(1).max(30_000),
    alternativas: z.array(alternativeSchema).min(2).max(10),
    tipo: z.literal("multipla_escolha").default("multipla_escolha"),
    resposta: z.string().trim().regex(/^[A-Z]$/).nullable().optional(),
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
    observacoes: optionalText(3_000),
    referencia_texto: optionalText(40_000),
    referencia_blocos: z.array(referenceBlockSchema).max(41).optional(),
    referencia_fonte: optionalText(1_000),
    tem_equacao: z.boolean().optional(),
  })
  .strict()
  .superRefine((question, context) => {
    const letters = question.alternativas.map((alternative) => alternative.letra);
    if (new Set(letters).size !== letters.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["alternativas"],
        message: "As letras das alternativas precisam ser únicas.",
      });
    }
    if (question.resposta && !letters.includes(question.resposta)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resposta"],
        message: "A resposta precisa corresponder a uma alternativa.",
      });
    }

    const referenceBlocks = question.referencia_blocos;
    if (referenceBlocks) {
      const imageCount = referenceBlocks.filter((block) => block.tipo === "imagem").length;
      const totalTextLength = referenceBlocks.reduce(
        (total, block) => total + (block.tipo === "texto" ? block.texto.length : 0),
        0,
      );

      if (imageCount > 20) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["referencia_blocos"],
          message: "A referência pode conter no máximo 20 espaços para imagem.",
        });
      }
      if (totalTextLength > 40_000) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["referencia_blocos"],
          message: "O texto da referência excede 40.000 caracteres.",
        });
      }
      if (question.referencia_texto?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["referencia_texto"],
          message: "Envie referencia_texto ou referencia_blocos, não os dois.",
        });
      }
      if (referenceBlocks.some(
        (block) => block.tipo === "texto" && /\[\[img:\d+\]\]/.test(block.texto),
      )) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["referencia_blocos"],
          message: "Use um bloco tipo imagem no lugar de marcadores escritos no texto.",
        });
      }
    }
  });

const requestSchema = z
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

type Question = z.infer<typeof questionSchema>;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function stableQuestionId(issueId: number): Promise<string> {
  const source = REPOSITORY + "#issue-id:" + String(issueId);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  const bytes = Array.from(new Uint8Array(digest).slice(0, 16));
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

function toReferenceContent(question: Pick<Question, "referencia_texto" | "referencia_blocos">) {
  if (!question.referencia_blocos) {
    return { text: question.referencia_texto || null, images: [] as { url: string; pending: true }[] };
  }

  const images: { url: string; pending: true }[] = [];
  const text = question.referencia_blocos.map((block) => {
    if (block.tipo === "texto") return block.texto;
    const imageNumber = images.push({ url: "", pending: true });
    return `[[img:${imageNumber}]]`;
  }).join("");

  return { text: text || null, images };
}

function toQuestionRow(question: Question, id: string) {
  const related = question.conteudos_relacionados ?? [];
  const tags = question.tags_livres ?? [];
  const reference = toReferenceContent(question);

  return {
    id,
    numero: question.numero || null,
    enunciado: question.enunciado,
    alternativas: question.alternativas,
    tipo: question.tipo,
    resposta: question.resposta || null,
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
    referencia_fonte: question.referencia_fonte || null,
    referencia_imagem: null,
    referencia_imagem_pos: null,
    referencia_imagem_layout: null,
    referencia_texto_apos: null,
    referencia_imagens_extra: reference.images,
    grupo_id: null,
    tem_equacao: question.tem_equacao ?? false,
    tem_imagem: reference.images.length > 0,
    imagem_original_url: null,
    enunciado_imagem: null,
    enunciado_imagem_pos: null,
    enunciado_imagem_layout: null,
    enunciado_imagens_extra: [],
  };
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

        const validation = requestSchema.safeParse(input);
        if (!validation.success) {
          const details = validation.error.issues
            .slice(0, 8)
            .map((issue) => issue.path.join(".") + ": " + issue.message);
          return json(
            { ok: false, error: "A questão não passou pela validação.", details },
            422,
          );
        }

        try {
          const { question, source } = validation.data;
          const id = await stableQuestionId(source.issue_id);

          // Import inside the request handler so the service-role client never enters the browser bundle.
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

          if (existing) {
            return json({ ok: true, status: "already_inserted", id });
          }

          const { data, error } = await supabaseAdmin
            .from("questions")
            .insert(toQuestionRow(question, id))
            .select("id")
            .single();

          if (error) {
            if (error.code === "23505") {
              return json({ ok: true, status: "already_inserted", id });
            }
            console.error("[Question ingest] Insert failed:", error.code);
            return json({ ok: false, error: "Não foi possível gravar a questão no banco." }, 502);
          }

          return json({ ok: true, status: "inserted", id: data.id }, 201);
        } catch (error) {
          console.error("[Question ingest] Unexpected server error:", error);
          return json({ ok: false, error: "O servidor não conseguiu processar a questão." }, 500);
        }
      },
    },
  },
});
