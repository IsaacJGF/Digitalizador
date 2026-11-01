import { createFileRoute } from "@tanstack/react-router";
import { Buffer } from "node:buffer";
import { z } from "zod";

const REPOSITORY = "IsaacJGF/Digitalizador";
const MAX_BODY_BYTES = 18 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_CHARS = 8 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const imageDataUrlSchema = z
  .string()
  .max(MAX_IMAGE_DATA_URL_CHARS)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/)
  .refine((value) => {
    const encoded = value.slice("data:image/png;base64,".length);
    const header = Buffer.from(encoded.slice(0, 32), "base64");
    if (!header.subarray(0, 8).equals(PNG_SIGNATURE) || header.length < 24) return false;
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    return width > 0 && height > 0 && width <= 16_384 && height <= 16_384 && width * height <= 18_000_000;
  }, "Envie uma imagem PNG válida.");

const imageLayoutSchema = z
  .object({
    x: z.number().min(0).max(100).optional(),
    y: z.number().min(0).max(100).optional(),
    width: z.number().min(8).max(95).optional(),
    height: z.number().min(8).max(90).optional(),
    rotation: z.number().min(-3600).max(3600).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    mode: z.literal("block").optional(),
  })
  .strict();

const extraImageSchema = z
  .object({
    slot: z.number().int().min(1).max(20).optional(),
    inserir_depois: z.string().max(40_000).optional(),
    inserir_antes: z.string().min(1).max(40_000).optional(),
    url: imageDataUrlSchema,
    import_id: z.string().regex(/^[a-z0-9][a-z0-9._:-]{1,179}$/),
    substituir: z.boolean().optional(),
    layout: imageLayoutSchema.optional(),
  })
  .strict()
  .superRefine((image, context) => {
    const placementCount = [
      image.slot !== undefined,
      image.inserir_depois !== undefined,
      image.inserir_antes !== undefined,
    ].filter(Boolean).length;
    if (placementCount !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe somente um entre slot, inserir_depois e inserir_antes.",
      });
    }
  });

const alternativeImageSchema = z
  .object({
    letra: z.string().regex(/^[A-Z]$/),
    url: imageDataUrlSchema,
    substituir: z.boolean().optional(),
  })
  .strict();

const identificationSchema = z
  .object({
    id: z.string().uuid().optional(),
    ano: z.string().trim().min(1).max(20),
    prova: z.string().trim().min(1).max(100),
    numero: z.string().trim().min(1).max(40),
    instituicao: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

const questionSchema = z
  .object({
    identificacao: identificationSchema,
    referencia_imagens: z.array(extraImageSchema).max(20).optional(),
    enunciado_imagens: z.array(extraImageSchema).max(20).optional(),
    alternativas_imagens: z.array(alternativeImageSchema).max(10).optional(),
  })
  .strict()
  .superRefine((question, context) => {
    const imageCount =
      (question.referencia_imagens?.length ?? 0) +
      (question.enunciado_imagens?.length ?? 0) +
      (question.alternativas_imagens?.length ?? 0);

    if (imageCount === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referencia_imagens"],
        message: "A questão precisa conter ao menos uma imagem.",
      });
    }

    for (const [field, images] of [
      ["referencia_imagens", question.referencia_imagens ?? []],
      ["enunciado_imagens", question.enunciado_imagens ?? []],
    ] as const) {
      const slots = images.flatMap((image) => image.slot === undefined ? [] : [image.slot]);
      if (new Set(slots).size !== slots.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "Cada slot pode aparecer uma única vez no mesmo campo.",
        });
      }
    }

    const letters = (question.alternativas_imagens ?? []).map((image) => image.letra);
    if (new Set(letters).size !== letters.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["alternativas_imagens"],
        message: "Cada alternativa pode receber uma única imagem por lote.",
      });
    }
  });

const requestSchema = z
  .object({
    source: z
      .object({
        repository: z.literal(REPOSITORY),
        commit_sha: z.string().regex(/^[0-9a-f]{40}$/),
        batch: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
      })
      .strict(),
    questions: z.array(questionSchema).min(1).max(25),
  })
  .strict()
  .superRefine((request, context) => {
    const imageCount = request.questions.reduce(
      (total, question) =>
        total +
        (question.referencia_imagens?.length ?? 0) +
        (question.enunciado_imagens?.length ?? 0) +
        (question.alternativas_imagens?.length ?? 0),
      0,
    );
    if (imageCount > 40) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions"],
        message: "Um lote pode conter no máximo 40 imagens.",
      });
    }
  });

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/question-image-ingest")({
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
        if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
          return json({ ok: false, error: "O lote excede o limite de 18 MiB." }, 413);
        }

        let rawBody: string;
        try {
          rawBody = await request.text();
        } catch {
          return json({ ok: false, error: "Não foi possível ler o lote enviado." }, 400);
        }

        if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
          return json({ ok: false, error: "O lote excede o limite de 18 MiB." }, 413);
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
          return json({ ok: false, error: "O lote não passou pela validação.", details }, 422);
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc(
            "import_question_images_batch",
            { _items: validation.data.questions },
          );

          if (error) {
            console.error("[Question image ingest] Batch failed:", error.code);
            if (error.code === "P0001" || error.message.startsWith("QUESTION_IMAGE_INGEST:")) {
              const detail = error.message.replace(/^QUESTION_IMAGE_INGEST:\s*/, "");
              return json(
                { ok: false, error: "O lote inteiro foi rejeitado.", details: [detail] },
                422,
              );
            }
            return json({ ok: false, error: "Não foi possível gravar o lote no banco." }, 502);
          }

          return json({ ok: true, status: "imported", result: data });
        } catch (error) {
          console.error("[Question image ingest] Unexpected server error:", error);
          return json({ ok: false, error: "O servidor não conseguiu processar o lote." }, 500);
        }
      },
    },
  },
});
